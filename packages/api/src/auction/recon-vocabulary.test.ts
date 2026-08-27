/**
 * The reconciliation ① vocabulary, pinned.
 *
 * This exists because the status set was renamed twice and each rename left a
 * survivor: a table rendered a raw status it had no label for, so an
 * acknowledgement line the broker plainly listed showed as "unexpected".
 *
 * The rule is one question — is the invoice in the acknowledgement? — and
 * these tests hold it there, from both directions, so the next person adding a
 * status has to change a test to do it.
 *
 * Run: pnpm --dir packages/api test:recon-vocab
 */
import { reconcileAcknowledgement, type InvoicedLot, type ReconStatus } from "./reconcile";
import type { ParsedAcknowledgement } from "./parse-acknowledgement";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
}

const ackLot = (invoiceNo: string, section: "catalogued" | "shutout", netWt = 100) => ({
  section, markCode: "MF1530", markName: "KUMUDU", dispatchDate: null,
  lotNo: "0001", invoiceNo, grade: "OP", bags: 10, kgPerBag: netWt / 10, netWt,
  shutoutReason: section === "shutout" ? "held back" : null, reprint: false,
});
const ack = (lots: ReturnType<typeof ackLot>[]) => ({ lots } as unknown as ParsedAcknowledgement);
const invoiced = (invoiceNo: string, netWt = 100): InvoicedLot =>
  ({ id: `lot-${invoiceNo}`, invoiceNo, grade: "OP", netWt });

// ---- exactly three statuses, no more ----
const ALLOWED: ReconStatus[] = ["catalogued", "shutout", "not-acknowledged"];
const everyShape = reconcileAcknowledgement(
  [invoiced("0001"), invoiced("0002"), invoiced("0009")],
  ack([ackLot("0001", "catalogued"), ackLot("0002", "shutout"), ackLot("0777", "catalogued")]),
);
ok("every row carries one of the three allowed statuses",
  everyShape.rows.every((r) => ALLOWED.includes(r.status)),
  [...new Set(everyShape.rows.map((r) => r.status))].join(","));
ok("no row is ever `unexpected` or `pending` again",
  everyShape.rows.every((r) => r.status !== ("unexpected" as ReconStatus) && r.status !== ("pending" as ReconStatus)));

// ---- in the ack → acknowledged, whether or not we hold the invoice ----
ok("a catalogued line we invoiced is catalogued",
  everyShape.rows.find((r) => r.invoiceNo === "0001")?.status === "catalogued");
ok("a shutout line we invoiced is shutout",
  everyShape.rows.find((r) => r.invoiceNo === "0002")?.status === "shutout");
ok("a catalogued line we NEVER invoiced is STILL catalogued — the ack lists it",
  everyShape.rows.find((r) => r.invoiceNo === "0777")?.status === "catalogued",
  everyShape.rows.find((r) => r.invoiceNo === "0777")?.status ?? "no row");
ok("...and it is identified by having no invoiced side, not by its status",
  everyShape.rows.find((r) => r.invoiceNo === "0777")?.invoiced === null);

// ---- not in the ack → not-acknowledged ----
ok("an invoice the ack never lists is not-acknowledged",
  everyShape.rows.find((r) => r.invoiceNo === "0009")?.status === "not-acknowledged");
ok("...and it keeps its invoiced side",
  Boolean(everyShape.rows.find((r) => r.invoiceNo === "0009")?.invoiced));

// ---- the summary counts what the rows say ----
const s = everyShape.summary;
ok("summary agrees with the rows",
  s.catalogued === everyShape.rows.filter((r) => r.status === "catalogued").length &&
  s.shutout === everyShape.rows.filter((r) => r.status === "shutout").length &&
  s.notAcknowledged === everyShape.rows.filter((r) => r.status === "not-acknowledged").length,
  JSON.stringify(s));
ok("notAcknowledgedKg sums only OUR weight, never the broker's",
  s.notAcknowledgedKg === 100, `${s.notAcknowledgedKg}`);

// ---- nothing is lost ----
ok("every ack line and every invoice of ours appears exactly once",
  everyShape.rows.length === 4, `${everyShape.rows.length} rows`);

// ---- an empty acknowledgement is not an error ----
const empty = reconcileAcknowledgement([invoiced("0001")], ack([]));
ok("an ack listing nothing leaves our invoice not-acknowledged, not missing",
  empty.rows.length === 1 && empty.rows[0].status === "not-acknowledged");
const noInvoices = reconcileAcknowledgement([], ack([ackLot("0001", "catalogued")]));
ok("an ack for a sale we invoiced nothing in still acknowledges its own lines",
  noInvoices.summary.catalogued === 1 && noInvoices.summary.notAcknowledged === 0);

console.log(failures === 0 ? "\nRECON VOCABULARY: ALL CHECKS PASSED" : `\nRECON VOCABULARY: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
