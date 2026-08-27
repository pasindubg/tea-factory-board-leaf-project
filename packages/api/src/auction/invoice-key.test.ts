// Invoice match-key test. Run: pnpm --dir packages/api test:invoice-key
//
// Guards the index-cycle regression: the factory stores "26I01-0001" while a
// broker document prints "0001", so reconciling them verbatim reported every
// invoice as pending and every document line as not-acknowledged.
import { invoiceMatchKey, invoiceNumbersMatch } from "./invoice-key";
import { reconcileAcknowledgement, type InvoicedLot } from "./reconcile";
import type { ParsedAcknowledgement } from "./parse-acknowledgement";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

// ---------- the key itself ----------
ok("prefixed and bare numbers share a key", invoiceMatchKey("26I01-0001") === invoiceMatchKey("0001"));
ok("padding differences are ignored", invoiceMatchKey("1") === invoiceMatchKey("0001"));
ok("003 and 0003 agree", invoiceMatchKey("003") === invoiceMatchKey("0003"));
ok("different sequences stay apart", invoiceMatchKey("26I01-0001") !== invoiceMatchKey("26I01-0002"));
ok("a doubled prefix still resolves", invoiceMatchKey("26I01-26I01-0003") === invoiceMatchKey("0003"));
ok("blank is not a wildcard", invoiceMatchKey("") === "" && !invoiceNumbersMatch("", ""));
ok("null is not a wildcard", !invoiceNumbersMatch(null, null));
ok("non-numeric sequence compares case-insensitively", invoiceNumbersMatch("26I01-abc", "ABC"));

// ---------- the reported failure, end to end ----------
const invoiced: InvoicedLot[] = [
  { id: "lot-1", invoiceNo: "26I01-0001", grade: "OPA", netWt: 237.5 },
  { id: "lot-2", invoiceNo: "26I01-0941", grade: "PEKO", netWt: 296.5 },
];

const ackLots = [
  { invoiceNo: "0001", lotNo: "0416", markCode: "MF1530", grade: "OPA", netWt: 240, section: "catalogued" },
  { invoiceNo: "0941", lotNo: "0415", markCode: "MF1530", grade: "PEKO", netWt: 300, section: "catalogued" },
];
const ack = { lots: ackLots } as unknown as ParsedAcknowledgement;

const full = reconcileAcknowledgement(invoiced, ack);
ok("every invoice matches its acknowledgement line", full.summary.catalogued === 2,
  `catalogued=${full.summary.catalogued}`);
ok("nothing is left not-acknowledged", full.summary.notAcknowledged === 0,
  `notAcknowledged=${full.summary.notAcknowledged}`);
ok("matched rows show the factory's own full number",
  full.rows.map((r) => r.invoiceNo).sort().join(",") === "26I01-0001,26I01-0941",
  full.rows.map((r) => r.invoiceNo).join(","));
ok("weight delta survives the match",
  full.rows.find((r) => r.invoiceNo === "26I01-0001")?.weightDelta === 2.5);

// ---------- the classifications must still work ----------
const withStranger = {
  lots: [...ackLots, { invoiceNo: "9999", lotNo: "0500", markCode: "MF1530", grade: "BT", netWt: 100, section: "catalogued" }],
} as unknown as ParsedAcknowledgement;
const stranger = reconcileAcknowledgement(invoiced, withStranger);
ok("a line we never invoiced is still acknowledged — the ack lists it",
  stranger.summary.catalogued === 3 && stranger.summary.notAcknowledged === 0,
  `catalogued=${stranger.summary.catalogued} notAcknowledged=${stranger.summary.notAcknowledged}`);
ok("...and it is the row with no invoiced side",
  stranger.rows.filter((r) => r.ack && !r.invoiced).map((r) => r.invoiceNo).join(",") === "9999",
  stranger.rows.filter((r) => r.ack && !r.invoiced).map((r) => r.invoiceNo).join(","));

const partial = reconcileAcknowledgement(invoiced, { lots: [ackLots[0]] } as unknown as ParsedAcknowledgement);
ok("an invoice this ack never lists is not-acknowledged", partial.summary.notAcknowledged === 1,
  `notAcknowledged=${partial.summary.notAcknowledged}`);

console.log(failures === 0 ? "\nINVOICE MATCH KEY: ALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
