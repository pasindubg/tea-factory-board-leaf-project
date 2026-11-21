/** Development-only, rollback-only RLS check. It creates synthetic fixtures and
 * never reads passwords, resets logins, or changes an existing user's role. */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const url = process.env.NEON_DATABASE_URL?.replace(/^"|"$/g, "");
if (!url) throw new Error("Source the development .env first.");
const host = new URL(url).hostname;
if (host !== "ep-shy-cell-azrbtvl5.c-3.ap-southeast-1.aws.neon.tech") throw new Error("This check is pinned to development-01.");
const sql = postgres(url, { max: 1, prepare: false });
const rollback = new Error("ROLLBACK_MOBILE_REGISTRATION_FIXTURES");
let checks = 0;
function check(ok: boolean, label: string) {
  if (!ok) throw new Error(label);
  checks++;
  console.log(`PASS ${label}`);
}
try {
  await sql.begin(async (tx) => {
    const migration = readFileSync(new URL("../drizzle/0082_driver_supplier_registration.sql", import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) await tx.unsafe(statement);
    const assignmentMigration = readFileSync(new URL("../drizzle/0083_driver_user_assignments.sql", import.meta.url), "utf8");
    // Once the migration is live, the trial runs against its existing policies.
    const [live] = await tx`select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='assigned_driver_line_ids') present`;
    if (!live.present) for (const statement of assignmentMigration.split("--> statement-breakpoint")) await tx.unsafe(statement);
    const [numberingLive] = await tx`select exists(select 1 from information_schema.columns where table_schema='public' and table_name='suppliers' and column_name='registration_no') present`;
    if (!numberingLive.present) {
      const numbering = readFileSync(new URL("../drizzle/0084_supplier_registration_numbers.sql", import.meta.url), "utf8");
      for (const statement of numbering.split("--> statement-breakpoint")) await tx.unsafe(statement);
    }
    await tx.unsafe(readFileSync(new URL("../neon/003_request_identity.sql", import.meta.url), "utf8"));
    const factoryA = randomUUID(), factoryB = randomUUID(), lineA = randomUUID(), lineB = randomUUID(), unassignedLine = randomUUID();
    await tx`insert into factories (id, name) values (${factoryA}, 'mobile-registration-verify-a'), (${factoryB}, 'mobile-registration-verify-b')`;
    const ownerId = randomUUID();
    await tx`insert into users(id,factory_id,name,email,role,active) values(${ownerId},${factoryA},'Synthetic owner',${ownerId+'@example.invalid'},'owner',true)`;
    await tx`insert into lines (id, factory_id, line_no) values (${lineA}, ${factoryA}, 'verify-a'), (${lineB}, ${factoryB}, 'verify-b'), (${unassignedLine}, ${factoryA}, 'verify-unassigned')`;

    for (const role of ["field_officer", "driver"] as const) {
      const user = randomUUID();
      await tx`insert into users (id, factory_id, name, email, role, active) values (${user}, ${factoryA}, 'Synthetic field test', ${user + '@example.invalid'}, ${role}, true)`;
      await tx`insert into user_devices (factory_id, user_id, device_id) values (${factoryA}, ${user}, 'verify-bound-phone')`;
      const driverId = randomUUID();
      if (role === "driver") {
        await tx.savepoint(async (query) => {
          await query`select set_config('request.jwt.claims', ${JSON.stringify({sub:ownerId,role:'authenticated'})}, true)`;
          await query.unsafe('set local role authenticated');
          const linked = await query`insert into drivers (id, factory_id, user_id, name) values (${driverId}, ${factoryA}, ${user}, 'Synthetic driver') returning id`;
          check(linked.length === 1, "authenticated owner can link an existing Driver user");
          await query.unsafe('reset role');
        });
        await tx`insert into line_drivers (factory_id, line_id, driver_id) values (${factoryA}, ${lineA}, ${driverId})`;
        let foreignLink: string | undefined;
        try { await tx.savepoint((query) => query`insert into drivers(factory_id,user_id,name) values(${factoryB},${user},'Foreign link')`); }
        catch (error) { foreignLink=(error as {code?:string}).code; }
        check(foreignLink === "23514", "driver User ID cannot link to another factory's account");
      }
      const asUser = <T>(device: string | null, action: (query: postgres.TransactionSql) => Promise<T>) => tx.savepoint(async (query) => {
        await query`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user, role: "authenticated" })}, true)`;
        await query`select set_config('request.headers', ${JSON.stringify(device ? { "x-device-id": device } : {})}, true)`;
        await query.unsafe("set local role authenticated");
        const value = await action(query);
        await query.unsafe("reset role");
        return value;
      });
      const insert = (query: postgres.TransactionSql, factory: string, line: string) => query`
        insert into suppliers (id, factory_id, line_id, name, phone, latitude, longitude, registered_by_user_id)
        values (${randomUUID()}, ${factory}, ${line}, 'Synthetic supplier', '0770000000', 6.9271, 79.8612, ${user}) returning id, registration_no, customer_no`;
      const refused = async (action: () => Promise<unknown>, code: string, label: string) => {
        let actual: string | undefined;
        try { await action(); } catch (error) { actual = (error as { code?: string }).code; }
        check(actual === code, `${role}: ${label} (${actual ?? "unexpectedly allowed"})`);
      };
      const bound = await asUser("verify-bound-phone", (query) => query`select public.register_device('verify-bound-phone','android','test','0.1.0') outcome`);
      check(bound[0].outcome === "bound", `${role}: mobile sign-in can confirm its phone binding`);
      const secondPhone = await asUser("wrong-phone", (query) => query`select public.register_device('wrong-phone','android','test','0.1.0') outcome`);
      check(secondPhone[0].outcome === "blocked", `${role}: sign-in refuses a second phone`);
      const inserted = await asUser("verify-bound-phone", (query) => insert(query, factoryA, lineA));
      check(inserted.length === 1, `${role}: bound phone registers a supplier`);
      check(inserted[0].customer_no === null && inserted[0].registration_no > 0, `${role}: automatic registration number with office number unassigned`);
      await refused(() => asUser("verify-bound-phone", (query) => query`insert into suppliers(factory_id,line_id,customer_no,name,phone,latitude,longitude)
        values(${factoryA},${lineA},'12345','Forged office number','0770000000',6.9,79.8)`), "42501", "mobile cannot provide a customer number at registration");
      await refused(() => asUser("verify-bound-phone", (query) => query`insert into suppliers(factory_id,line_id,registration_no,name,phone,latitude,longitude)
        values(${factoryA},${lineA},999,'Forged registration number','0770000000',6.9,79.8)`), "23514", "mobile cannot provide its own registration number");
      await refused(() => asUser("verify-bound-phone", (query) => query`update suppliers set customer_no='000001' where id=${inserted[0].id}`), "42501", "mobile cannot assign the office customer number");
      await refused(() => asUser("verify-bound-phone", (query) => query`update suppliers set registration_no=999 where id=${inserted[0].id}`), "23514", "registration number cannot be edited");
      const counters = await asUser("verify-bound-phone", (query) => query`select * from supplier_registration_counters`);
      check(counters.length === 0, `${role}: internal numbering state cannot be read directly`);
      const counterUpdates = await asUser("verify-bound-phone", (query) => query`update supplier_registration_counters set last_no=9000 where factory_id=${factoryA} returning factory_id`);
      check(counterUpdates.length === 0, `${role}: numbering cannot be reset directly`);
      await refused(() => asUser("verify-bound-phone", (query) => query`insert into supplier_registration_counters(factory_id,last_no) values(${factoryB},100)`), "42501", "direct counter insert is denied");
      await refused(() => asUser("verify-bound-phone", (query) => query`insert into supplier_registration_counters(factory_id,last_no) values(${factoryA},100)`), "42501", "direct own-factory counter insert is denied");
      const [{ last_no: beforeFailure }] = await tx`select last_no from supplier_registration_counters where factory_id=${factoryA}`;
      await refused(() => asUser("wrong-phone", (query) => insert(query, factoryA, lineA)), "42501", "wrong phone is denied");
      await refused(() => asUser(null, (query) => insert(query, factoryA, lineA)), "42501", "missing device is denied");
      await refused(() => asUser("verify-bound-phone", (query) => insert(query, factoryB, lineB)), "42501", "foreign factory is denied");
      await refused(() => asUser("verify-bound-phone", (query) => insert(query, factoryA, lineB)), role === "driver" ? "42501" : "23503", "foreign line is denied");
      await refused(() => asUser("verify-bound-phone", (query) => query`update suppliers set factory_id = ${factoryB} where id = ${inserted[0].id}`), "23514", "tenant replacement is denied");
      const [{ last_no: afterFailure }] = await tx`select last_no from supplier_registration_counters where factory_id=${factoryA}`;
      check(beforeFailure === afterFailure, `${role}: failed registrations do not consume numbers`);
      await tx.savepoint(async (query) => {
        await query`select set_config('request.jwt.claims', ${JSON.stringify({sub:ownerId,role:'authenticated'})}, true)`;
        await query.unsafe('set local role authenticated');
        const assigned = await query`update suppliers set customer_no=${'00'+String(checks)} where id=${inserted[0].id} returning customer_no, registration_no`;
        check(assigned.length === 1 && assigned[0].customer_no.startsWith('00') && assigned[0].registration_no === inserted[0].registration_no, `${role}: office can assign a customer number without changing registration number`);
        await query.unsafe('reset role');
      });
      await refused(() => asUser("verify-bound-phone", (query) => query`update suppliers set customer_no=null where id=${inserted[0].id}`), "42501", "mobile cannot remove the office number");
      const visible = await asUser("verify-bound-phone", (query) => query`select distinct factory_id from suppliers`);
      check(visible.every((row) => row.factory_id === factoryA), `${role}: supplier reads remain factory scoped`);
      if (role === "field_officer") {
        const unassigned = await asUser("verify-bound-phone", (query) => insert(query, factoryA, unassignedLine));
        check(unassigned.length === 1, "field officer retains factory-wide registration");
        await refused(() => asUser("verify-bound-phone", (query) => query`delete from lines where id = ${lineA}`), "23503", "a line with suppliers cannot be deleted");
      } else {
        const lines = await asUser("verify-bound-phone", (query) => query`select id from lines`);
        check(lines.length === 1 && lines[0].id === lineA, "driver sees only their assigned line");
        const suppliers = await asUser("verify-bound-phone", (query) => query`select line_id from suppliers`);
        check(suppliers.every((row) => row.line_id === lineA), "driver cannot read suppliers from unassigned lines");
        await refused(() => asUser("verify-bound-phone", (query) => insert(query, factoryA, unassignedLine)), "42501", "unassigned same-factory registration is denied");
        await refused(() => asUser("verify-bound-phone", (query) => query`insert into line_drivers(factory_id, line_id, driver_id) values(${factoryA}, ${unassignedLine}, ${driverId})`), "42501", "driver cannot assign themselves another line");
        const escalated = await asUser("verify-bound-phone", (query) => query`update users set role='owner' where id=${user} returning id`);
        check(escalated.length === 0, "driver cannot grant themselves an owner role");
        const deleted = await asUser("verify-bound-phone", (query) => query`delete from lines where id=${lineA} returning id`);
        check(deleted.length === 0, "driver cannot delete an assigned line");
        const otherSupplier = randomUUID(), ownRequest = randomUUID(), otherRequest = randomUUID();
        await tx`insert into suppliers(id,factory_id,line_id,customer_no,name,phone,latitude,longitude)
          values(${otherSupplier},${factoryA},${unassignedLine},${String(Date.now())+'99'},'Other line supplier','0770000000',6.9,79.8)`;
        await tx`insert into supplier_requests(id,factory_id,supplier_id,type_key,status)
          values(${ownRequest},${factoryA},${inserted[0].id},'delivery_ready','approved'),
            (${otherRequest},${factoryA},${otherSupplier},'delivery_ready','approved')`;
        const requests = await asUser("verify-bound-phone", (query) => query`select id from supplier_requests`);
        check(requests.length === 1 && requests[0].id === ownRequest, "driver sees handovers only on their assigned line");
        const handed = await asUser("verify-bound-phone", (query) => query`update supplier_requests
          set status='handed_to_driver', handed_by=${user}, handed_at=now() where id=${ownRequest} returning id`);
        check(handed.length === 1, "driver retains assigned-line handover capability");
        const foreignHandover = await asUser("verify-bound-phone", (query) => query`update supplier_requests
          set status='handed_to_driver', handed_by=${user}, handed_at=now() where id=${otherRequest} returning id`);
        check(foreignHandover.length === 0, "driver cannot hand over an unassigned-line request");
        await tx`delete from line_drivers where driver_id=${driverId}`;
        const removed = await asUser("verify-bound-phone", (query) => query`select id from lines`);
        check(removed.length === 0, "unassigned driver sees zero lines immediately");
        await tx`insert into line_drivers(factory_id, line_id, driver_id) values(${factoryA}, ${lineA}, ${driverId})`;
        let duplicateCode: string | undefined;
        try { await tx.savepoint((query) => query`insert into drivers(factory_id,user_id,name) values(${factoryA},${user},'Duplicate driver')`); }
        catch (error) { duplicateCode=(error as {code?:string}).code; }
        check(duplicateCode === "23505", "a user cannot have duplicate driver records");
      }
      await tx`update user_devices set revoked_at = now() where user_id = ${user}`;
      await refused(() => asUser("verify-bound-phone", (query) => insert(query, factoryA, lineA)), "42501", "released phone is denied");
      if (role === "driver") {
        await tx`delete from users where id=${user}`;
        const [kept] = await tx`select user_id from drivers where id=${driverId}`;
        check(kept?.user_id === null, "deleting a login preserves and unlinks its driver record");
      }
    }
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await sql.end();
}
console.log(`Mobile registration: ${checks} checks passed; all fixtures and policy test changes rolled back.`);
