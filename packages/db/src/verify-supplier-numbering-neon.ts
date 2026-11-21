/** Development-only concurrency check. Uses synthetic factories/users, does
 * not create auth accounts, and removes every fixture in finally. */
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const url = process.env.NEON_DATABASE_URL;
if (!url || new URL(url).hostname !== "ep-shy-cell-azrbtvl5.c-3.ap-southeast-1.aws.neon.tech") throw new Error("This check is pinned to development-01.");
const sql = postgres(url, { max: 4, prepare: false });
const factory = randomUUID(), otherFactory = randomUUID(), user = randomUUID();
let checks = 0;
function check(ok: boolean, message: string) {
  if (!ok) throw new Error(message);
  checks++;
  console.log(`PASS ${message}`);
}
async function asUser<T>(action: (tx: postgres.TransactionSql) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user, role: "authenticated" })}, true)`;
    await tx`select set_config('request.headers', ${JSON.stringify({ "x-device-id": "numbering-test-phone" })}, true)`;
    await tx.unsafe("set local role authenticated");
    return action(tx);
  });
}
function insert(tx: postgres.TransactionSql, latitude = 6.9, id = randomUUID()) {
  return tx`insert into suppliers(id,client_uuid,factory_id,name,phone,latitude,longitude,registered_by_user_id)
    values(${id},${id},${factory},'Synthetic numbering supplier','0770000000',${latitude},79.8,${user}) returning id, registration_no, customer_no`;
}
try {
  await sql.begin(async (tx) => {
    await tx`insert into factories(id,name) values(${factory},'numbering-concurrency-test'),(${otherFactory},'numbering-isolation-test')`;
    await tx`insert into users(id,factory_id,name,email,role,active) values(${user},${factory},'Synthetic numbering user',${user+'@example.invalid'},'field_officer',true)`;
    await tx`insert into user_devices(factory_id,user_id,device_id) values(${factory},${user},'numbering-test-phone')`;
  });
  const registrations = await Promise.all(Array.from({ length: 10 }, () => asUser((tx) => insert(tx))));
  const numbers = registrations.map(([row]) => row.registration_no).sort((a, b) => a - b);
  check(numbers.every((number, index) => number === index + 1), "10 concurrent registrations get exactly 1 through 10");
  check(registrations.every(([row]) => row.customer_no === null), "concurrent mobile registrations leave office numbers unassigned");
  let failure: string | undefined;
  try { await asUser((tx) => insert(tx, -999)); } catch (error) { failure = (error as {code?:string}).code; }
  check(failure === "23514", "invalid GPS registration is rejected");
  const [afterFailure] = await asUser((tx) => insert(tx));
  check(afterFailure.registration_no === 11, "failed registration does not leave a numbering gap");
  let duplicate: string | undefined;
  try { await asUser((tx) => insert(tx, 6.9, afterFailure.id)); } catch (error) { duplicate = (error as {code?:string}).code; }
  check(duplicate === "23505", "duplicate registration ID is rejected");
  const [afterDuplicate] = await asUser((tx) => insert(tx));
  check(afterDuplicate.registration_no === 12, "duplicate retry does not consume a second number");
  await sql`delete from suppliers where factory_id=${factory} and id=${afterDuplicate.id}`;
  const [afterDelete] = await asUser((tx) => insert(tx));
  check(afterDelete.registration_no === 13, "a deleted registration number is never reused");
  const [other] = await sql`insert into suppliers(factory_id,name,phone,latitude,longitude) values(${otherFactory},'Synthetic other factory','0770000000',6.9,79.8) returning registration_no`;
  check(other.registration_no === 1, "each factory has an independent sequence");
} finally {
  await sql.begin(async (tx) => {
    await tx`delete from suppliers where factory_id in (${factory},${otherFactory})`;
    await tx`delete from user_devices where factory_id=${factory}`;
    await tx`delete from users where factory_id=${factory}`;
    await tx`delete from supplier_registration_counters where factory_id in (${factory},${otherFactory})`;
    await tx`delete from factories where id in (${factory},${otherFactory})`;
  });
  await sql.end();
}
console.log(`Supplier numbering: ${checks} checks passed; all synthetic records removed.`);
