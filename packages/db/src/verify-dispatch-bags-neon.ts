import { randomUUID } from "node:crypto";
import postgres from "postgres";

const url = process.env.NEON_DATABASE_URL;
if (!url) throw new Error("NEON_DATABASE_URL is required.");
const hostname = new URL(url).hostname;
if (hostname.includes("ep-sweet-river-azg84cej") || process.env.VERIFY_ALLOW_HOST !== hostname) {
  throw new Error("Name a non-production branch in VERIFY_ALLOW_HOST before running rollback-only bag checks.");
}
const sql = postgres(url, { max: 1, prepare: false });
const expect = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const rolledBack = Symbol("rollback");

try {
  await sql.begin(async (tx) => {
    const [fixture] = await tx`
      SELECT u.id AS actor_id, u.factory_id, b.id AS broker_id, g.code AS grade
      FROM public.users u
      JOIN public.brokers b ON b.factory_id = u.factory_id
      JOIN public.auction_grades g ON g.factory_id = u.factory_id
      WHERE u.role = 'owner' AND u.active IS TRUE
      LIMIT 1`;
    expect(fixture, "A factory with an active owner, broker and grade is required.");
    const [otherOwner] = await tx`SELECT id FROM public.users
      WHERE role = 'owner' AND active IS TRUE AND factory_id <> ${fixture.factory_id} LIMIT 1`;
    const dispatchNo = `BAG-VERIFY-${randomUUID()}`;
    const [dispatch] = await tx`
      INSERT INTO public.auction_bundled_dispatches
        (factory_id, dispatch_no, dispatch_date, dispatch_date_from, dispatch_date_to, warehouse, status)
      VALUES (${fixture.factory_id}, ${dispatchNo}, current_date, current_date, current_date,
        'Verification only', 'invoiced') RETURNING id`;
    const [sale] = await tx`
      INSERT INTO public.auction_sales
        (factory_id, broker_id, bundled_dispatch_id, sale_kind, sale_no, status)
      VALUES (${fixture.factory_id}, ${fixture.broker_id}, ${dispatch.id}, 'dispatch',
        ${dispatchNo}, 'invoiced') RETURNING id`;
    const [lot] = await tx`
      INSERT INTO public.auction_lots
        (factory_id, sale_id, invoice_no, grade, bags, kg_per_bag, net_wt)
      VALUES (${fixture.factory_id}, ${sale.id}, ${dispatchNo}, ${fixture.grade}, 2, 32.00, 64.00)
      RETURNING id`;

    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: fixture.actor_id })}, true)`;
    const [legacy] = await tx`SELECT bag_check_mode AS mode FROM public.auction_bundled_dispatches WHERE id = ${dispatch.id}`;
    expect(legacy.mode === "legacy", "New dispatches must stay on the safe legacy default until explicitly enabled.");
    const [enabled] = await tx`SELECT public.enable_dispatch_bag_checks(${dispatch.id}) AS enabled`;
    expect(enabled.enabled === true, "Authorized owner must be able to opt in before departure.");

    let denied = false;
    try {
      await tx.savepoint(async (sp) => {
        await sp`INSERT INTO public.auction_dispatch_lot_checks
          (factory_id, dispatch_id, lot_id, grade, expected_bags, target_grams, under_tolerance_grams, over_tolerance_grams)
          VALUES (${fixture.factory_id}, ${dispatch.id}, ${lot.id}, ${fixture.grade}, 2, 32000, 100, 100)`;
      });
    } catch { denied = true; }
    expect(denied, "Direct manifest insert must be denied.");

    const [started] = await tx`SELECT public.start_dispatch_bag_checks(${dispatch.id}, 100, 150) AS count`;
    expect(Number(started.count) === 1, "Exactly one lot must be initialized.");
    const [restarted] = await tx`SELECT public.start_dispatch_bag_checks(${dispatch.id}, 100, 150) AS count`;
    expect(Number(restarted.count) === 1, "Retried manifest setup must be idempotent.");
    if (otherOwner) {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: otherOwner.id })}, true)`;
      const [hidden] = await tx`SELECT count(*)::int AS total FROM public.auction_dispatch_bags
        WHERE dispatch_id = ${dispatch.id}`;
      expect(hidden.total === 0, "A different factory must not see this dispatch's bags.");
      let crossTenantDenied = false;
      try {
        await tx.savepoint(async (sp) => {
          await sp`SELECT public.start_dispatch_bag_checks(${dispatch.id}, 100, 150)`;
        });
      } catch { crossTenantDenied = true; }
      expect(crossTenantDenied, "A different factory must not start this manifest.");
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: fixture.actor_id })}, true)`;
    }
    const [manifest] = await tx`
      SELECT c.id, c.expected_bags, c.target_grams, count(b.id)::int AS bags
      FROM public.auction_dispatch_lot_checks c
      JOIN public.auction_dispatch_bags b ON b.check_id = c.id
      WHERE c.dispatch_id = ${dispatch.id} GROUP BY c.id`;
    expect(manifest.expected_bags === 2 && manifest.target_grams === 32000 && manifest.bags === 2,
      "Manifest snapshot or numbered bags are wrong.");

    let manualDenied = false;
    try {
      await tx.savepoint(async (sp) => {
        await sp`UPDATE public.auction_bundled_dispatches SET dispatched_at = now(), status = 'dispatched'
          WHERE id = ${dispatch.id}`;
      });
    } catch { manualDenied = true; }
    expect(manualDenied, "Manual dispatch must be blocked before bag completion.");

    let lotEditDenied = false;
    try {
      await tx.savepoint(async (sp) => { await sp`UPDATE public.auction_lots SET bags = 3 WHERE id = ${lot.id}`; });
    } catch { lotEditDenied = true; }
    expect(lotEditDenied, "Bag count must be frozen after manifest setup.");

    const first = { load: randomUUID(), reading: randomUUID(), request: randomUUID() };
    const second = { load: randomUUID(), reading: randomUUID(), request: randomUUID() };
    let badWeightDenied = false;
    try {
      await tx.savepoint(async (sp) => {
        await sp`SELECT public.confirm_dispatch_bag(${dispatch.id}, ${lot.id}, 1, 31899,
          'verify-scale', ${first.load}, ${first.reading}, ${first.request}, 'scale', true, clock_timestamp())`;
      });
    } catch { badWeightDenied = true; }
    expect(badWeightDenied, "A reading below the allowed margin must be rejected.");

    let simulatorDenied = false;
    try {
      await tx.savepoint(async (sp) => {
        await sp`SELECT public.confirm_dispatch_bag(${dispatch.id}, ${lot.id}, 1, 32000,
          'verify-scale', ${first.load}, ${first.reading}, ${first.request}, 'simulator', true, clock_timestamp())`;
      });
    } catch { simulatorDenied = true; }
    expect(simulatorDenied, "Simulated readings must never confirm a real bag.");
    let staleDenied = false;
    try {
      await tx.savepoint(async (sp) => {
        await sp`SELECT public.confirm_dispatch_bag(${dispatch.id}, ${lot.id}, 1, 32000,
          'verify-scale', ${first.load}, ${first.reading}, ${first.request}, 'scale', true,
          clock_timestamp() - interval '6 seconds')`;
      });
    } catch { staleDenied = true; }
    expect(staleDenied, "Stale readings must be rejected.");

    const [one] = await tx`SELECT public.confirm_dispatch_bag(${dispatch.id}, ${lot.id}, 1, 31900,
      'verify-scale', ${first.load}, ${first.reading}, ${first.request}, 'scale', true, clock_timestamp()) AS result`;
    expect(one.result.lotComplete === false && one.result.dispatchComplete === false,
      "First bag cannot complete the lot.");
    const [retry] = await tx`SELECT public.confirm_dispatch_bag(${dispatch.id}, ${lot.id}, 1, 31900,
      'verify-scale', ${first.load}, ${first.reading}, ${first.request}, 'scale', true, clock_timestamp()) AS result`;
    expect(retry.result.lotComplete === false, "Identical retry must be idempotent.");

    let replayDenied = false;
    try {
      await tx.savepoint(async (sp) => {
        await sp`SELECT public.confirm_dispatch_bag(${dispatch.id}, ${lot.id}, 2, 32150,
          'verify-scale', ${first.load}, ${second.reading}, ${second.request}, 'scale', true, clock_timestamp())`;
      });
    } catch { replayDenied = true; }
    expect(replayDenied, "A physical load cannot confirm two bags.");

    const [two] = await tx`SELECT public.confirm_dispatch_bag(${dispatch.id}, ${lot.id}, 2, 32150,
      'verify-scale', ${second.load}, ${second.reading}, ${second.request}, 'scale', true, clock_timestamp()) AS result`;
    expect(two.result.lotComplete === true && two.result.dispatchComplete === true,
      "Final bag must complete lot and dispatch atomically.");
    const [saved] = await tx`SELECT status, dispatched_at FROM public.auction_bundled_dispatches WHERE id = ${dispatch.id}`;
    expect(saved.status === "dispatched" && saved.dispatched_at, "Physical dispatch status was not persisted.");
    const [finalRetry] = await tx`SELECT public.confirm_dispatch_bag(${dispatch.id}, ${lot.id}, 2, 32150,
      'verify-scale', ${second.load}, ${second.reading}, ${second.request}, 'scale', true, clock_timestamp()) AS result`;
    expect(finalRetry.result.dispatchComplete === true, "Final-bag retry must return committed completion.");
    const [audit] = await tx`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE event_type = 'manifest_started')::int AS starts,
      count(*) FILTER (WHERE event_type = 'bag_confirmed')::int AS confirmations
      FROM public.auction_dispatch_bag_events WHERE dispatch_id = ${dispatch.id}`;
    expect(audit.total === 3 && audit.starts === 1 && audit.confirmations === 2,
      "Immutable audit events must record manifest setup and each accepted bag exactly once.");

    let auditEditDenied = false;
    try {
      await tx.savepoint(async (sp) => {
        const removed = await sp`DELETE FROM public.auction_dispatch_bag_events
          WHERE dispatch_id = ${dispatch.id} RETURNING id`;
        auditEditDenied = removed.length === 0;
      });
    } catch { auditEditDenied = true; }
    expect(auditEditDenied, "Bag audit history must reject deletion.");

    console.log("PASS rollback-only: RLS, manifest, margins, idempotency, load replay, manual guard, automatic completion, audit");
    throw rolledBack;
  });
} catch (error) {
  if (error !== rolledBack) throw error;
} finally {
  await sql.end();
}
