import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const results: string[] = [];
function record(pass: boolean, label: string, detail = "") {
  results.push(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const [user] = await sql<{ id: string; factory_id: string; role: string }[]>`
    SELECT id, factory_id, role FROM users WHERE role = 'collector' LIMIT 1
  `;
  if (!user) throw new Error("no seeded user to borrow");

  const [line] = await sql<{ id: string }[]>`
    INSERT INTO lines (factory_id, line_no, name)
    VALUES (${user.factory_id}, ${"VERIFY-" + Date.now()}, 'device binding check')
    RETURNING id
  `;

  await sql`UPDATE users SET role = 'field_officer' WHERE id = ${user.id}`;

  const asOfficer = (deviceId: string | null) => sql.begin(async (tx) => {
    await tx`SELECT set_config('role', 'authenticated', true)`;
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: user.id, role: "authenticated" })}, true)`;
    await tx`SELECT set_config('request.headers', ${JSON.stringify(deviceId ? { "x-device-id": deviceId } : {})}, true)`;
    return tx;
  });

  // Claim the device through the RPC, exactly as the app does.
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('role', 'authenticated', true)`;
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: user.id, role: "authenticated" })}, true)`;
    await tx`SELECT set_config('request.headers', ${JSON.stringify({ "x-device-id": "device-one" })}, true)`;
    const [{ register_device: outcome }] = await tx<{ register_device: string }[]>`
      SELECT public.register_device('device-one', 'ios', 'ios 18', '0.1.0')
    `;
    record(outcome === "claimed", "first phone claims the login", outcome);
  });

  // A second phone must be refused by the RPC.
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('role', 'authenticated', true)`;
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: user.id, role: "authenticated" })}, true)`;
    const [{ register_device: outcome }] = await tx<{ register_device: string }[]>`
      SELECT public.register_device('device-two', 'android', 'android 15', '0.1.0')
    `;
    record(outcome === "blocked", "second phone is refused", outcome);
  });

  const insertSupplier = async (deviceId: string | null, customerNo: string) => {
    try {
      await sql.begin(async (tx) => {
        await tx`SELECT set_config('role', 'authenticated', true)`;
        await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: user.id, role: "authenticated" })}, true)`;
        await tx`SELECT set_config('request.headers', ${JSON.stringify(deviceId ? { "x-device-id": deviceId } : {})}, true)`;
        await tx`
          INSERT INTO suppliers (factory_id, line_id, customer_no, name, phone, latitude, longitude)
          VALUES (${user.factory_id}, ${line.id}, ${customerNo}, 'Device check', '0770000000', 6.9271, 79.8612)
        `;
      });
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  };

  // Customer numbers are digits only, so each case gets its own numeric prefix.
  record((await insertSupplier("device-one", "1" + Date.now())) === null, "bound phone may register a customer");

  const wrongPhone = await insertSupplier("device-two", "2" + Date.now());
  record(wrongPhone !== null && /row-level security/i.test(wrongPhone), "unbound phone is refused", wrongPhone ?? "insert succeeded");

  const noHeader = await insertSupplier(null, "3" + Date.now());
  record(noHeader !== null && /row-level security/i.test(noHeader), "missing device header is refused", noHeader ?? "insert succeeded");

  // Releasing the device locks the phone out again.
  await sql`UPDATE user_devices SET revoked_at = now() WHERE user_id = ${user.id}`;
  const afterRevoke = await insertSupplier("device-one", "4" + Date.now());
  record(afterRevoke !== null && /row-level security/i.test(afterRevoke), "released device is refused", afterRevoke ?? "insert succeeded");

  // Other roles are untouched by the restrictive policy.
  await sql`UPDATE users SET role = ${user.role} WHERE id = ${user.id}`;
  const asCollector = await insertSupplier(null, "5" + Date.now());
  record(asCollector === null || !/row-level security/i.test(asCollector), "non-field roles are unaffected", asCollector ?? "inserted");

  await sql`DELETE FROM suppliers WHERE line_id = ${line.id}`;
  await sql`DELETE FROM user_devices WHERE user_id = ${user.id}`;
  await sql`DELETE FROM lines WHERE id = ${line.id}`;
  await sql`UPDATE users SET role = ${user.role} WHERE id = ${user.id}`;

  console.log(results.join("\n"));
  const failed = results.filter((line) => line.startsWith("FAIL"));
  console.log(`\nDevice binding: ${failed.length ? `${failed.length} CHECK(S) FAILED` : "ALL CHECKS PASSED"}`);
  await sql.end();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
