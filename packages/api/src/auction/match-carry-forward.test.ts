// End-to-end proof for the outstanding re-prints register, run against the
// REAL Asia Siyaka acknowledgement for sale 019 (the same fixture the parser
// suite uses). Invoice 0909 is the verified example: a bare number in a
// document where every other row is a current invoice, because it is a
// re-print left over from a sale that predates this system.
//
// Run: pnpm --dir packages/api test:carry-forward
import { readFileSync } from "node:fs";
import { parseAcknowledgement } from "./parse-acknowledgement";
import { reconcileAcknowledgement, type InvoicedLot } from "./reconcile";
import { carryForwardInvoiceFilters, matchCarryForwardLot, isCarryForwardCandidate, type CarryForwardCandidate } from "./match-carry-forward";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

const text = readFileSync(new URL("./__fixtures__/ack-asia-siyaka.txt", import.meta.url), "utf8");
const ack = parseAcknowledgement(text);

const ASIA_SIYAKA = "broker-asia-siyaka";
const BPML = "broker-bpml";
// The broker invoices this acknowledgement covers.
const THIS_SALE = ["sale-0019"];
// The register entry lives on its own Broker Invoice (entry_source
// 'reprint-register'), which is NOT part of the sale being acknowledged.
const REGISTER_SALE = "sale-reprint-register";

/** What the factory actually entered for this sale: everything except 0909. */
const invoiced: InvoicedLot[] = [
  { id: "lot-0951", invoiceNo: "26I01-0951", grade: "BOP1", netWt: 300 },
  { id: "lot-0952", invoiceNo: "26I01-0952", grade: "FBOP1", netWt: 300 },
  { id: "lot-0953", invoiceNo: "26I01-0953", grade: "FBOPF1", netWt: 360 },
  { id: "lot-0954", invoiceNo: "26I01-0954", grade: "FBOPF1", netWt: 360 },
  { id: "lot-0956", invoiceNo: "26I01-0956", grade: "BOP1A", netWt: 250 },
  { id: "lot-0957", invoiceNo: "26I01-0957", grade: "BM", netWt: 300 },
  { id: "lot-0002", invoiceNo: "26I01-0002", grade: "BM", netWt: 300 },
  { id: "lot-0958", invoiceNo: "26I01-0958", grade: "FGS", netWt: 400 },
];

// ---------- Step 1: the document does report 0909 as unexpected ----------

const recon = reconcileAcknowledgement(invoiced, ack);
const row0909 = recon.rows.find((row) => row.invoiceNo === "0909");
ok("0909 arrives from the ACK as `unexpected`", row0909?.status === "unexpected", row0909?.status ?? "no row");
ok("it is the only unexpected row in the document", recon.summary.unexpected === 1, `${recon.summary.unexpected}`);
ok("0909 is lot B1265, BOPA, 297.00 kg", row0909?.ack?.lotNo === "B1265" && row0909?.ack?.grade === "BOPA" && row0909?.ack?.netWt === 297,
  `${row0909?.ack?.lotNo} ${row0909?.ack?.grade} ${row0909?.ack?.netWt}`);

const ackRow = { invoiceNo: "0909", lotNo: "B1265" };

/** An outstanding re-print as the Re-prints page registers it: a real
 * acknowledged lot carrying the un-sold flag, under its own Broker Invoice,
 * for the broker holding it. */
function registerEntry(overrides: Partial<CarryForwardCandidate> = {}): CarryForwardCandidate {
  return {
    id: "lot-0909-register",
    saleId: REGISTER_SALE,
    invoiceNo: "26I01-0909",
    lotNo: null,
    state: "acknowledged",
    brokerId: ASIA_SIYAKA,
    dispatchDate: "2026-04-02",
    invoiceNos: ["26I01-0909"],
    hasSaleLine: false,
    ...overrides,
  };
}

const context = { groupSaleIds: THIS_SALE, brokerId: ASIA_SIYAKA };
const eligible = (lots: CarryForwardCandidate[]) => lots.filter((lot) => isCarryForwardCandidate(lot, context));

// ---------- Step 2: with nothing registered, 0909 stays unexpected ----------

ok("register empty → 0909 is unmatched, so it stays `unexpected`",
  matchCarryForwardLot(ackRow, eligible([])).status === "unmatched");

// An unrelated register entry must not soak up the row.
ok("a DIFFERENT invoice in the register does not match 0909",
  matchCarryForwardLot(ackRow, eligible([registerEntry({ id: "lot-0800", invoiceNo: "26I01-0800", invoiceNos: ["26I01-0800"] })])).status === "unmatched");

// ---------- Step 3: registered → resolves as a re-print child ----------

const matched = matchCarryForwardLot(ackRow, eligible([registerEntry()]));
ok("registered → 0909 matches the register entry",
  matched.status === "matched" && matched.candidate.id === "lot-0909-register",
  matched.status);
ok("the matched lot is movable, so the ACK can chain a CHILD lot onto it",
  matched.status === "matched" && matched.candidate.state === "acknowledged",
  matched.status === "matched" ? String(matched.candidate.state) : matched.status);

// The register stores the factory's prefixed number; the broker prints it bare.
ok("bare document number matches the stored prefixed number",
  matchCarryForwardLot(ackRow, eligible([registerEntry({ invoiceNo: "26I01-0909", invoiceNos: ["26I01-0909"] })])).status === "matched");
ok("a register entry stored bare matches too",
  matchCarryForwardLot(ackRow, eligible([registerEntry({ invoiceNo: "0909", invoiceNos: ["0909"] })])).status === "matched");

// ---------- Step 4: the gates that keep the signal honest ----------

ok("a register entry held by ANOTHER broker does not match — stays `unexpected`",
  matchCarryForwardLot(ackRow, eligible([registerEntry({ brokerId: BPML })])).status === "unmatched");

ok("a lot already inside this acknowledgement's own sale is not a carry-forward",
  matchCarryForwardLot(ackRow, eligible([registerEntry({ saleId: THIS_SALE[0] })])).status === "unmatched");

const sold = matchCarryForwardLot(ackRow, eligible([registerEntry({ state: "sold" })]));
ok("a sold lot is reported `blocked`, never rolled forward silently", sold.status === "blocked", sold.status);

const settledWithLine = matchCarryForwardLot(ackRow, eligible([registerEntry({ state: "valued", hasSaleLine: true })]));
ok("a lot with a sale_line is `blocked` even in a movable state", settledWithLine.status === "blocked", settledWithLine.status);

// ---------- Step 5: one stored lot cannot serve two document rows ----------

const used = new Set<string>(["lot-0909-register"]);
ok("a lot already claimed by an earlier row is not reused",
  matchCarryForwardLot(ackRow, eligible([registerEntry()]), used).status === "unmatched");

// ---------- Step 6: the FETCH must find what the matcher judges ----------
//
// Regression: the candidate query used an exact `invoice_no.in.(0909)` while
// the matcher saw through the index-cycle prefix. A register entry stored as
// "26I02-0909" was never fetched, so the matcher got an empty list and 0909
// stayed `unexpected` no matter what had been registered.

const filters = carryForwardInvoiceFilters(["0909"]);
ok("the fetch filter covers a bare stored number", filters.includes("invoice_no.eq.0909"), filters.join(" | "));
ok("the fetch filter covers a PREFIXED stored number", filters.includes("invoice_no.like.*-0909"), filters.join(" | "));

/** Mirrors what PostgREST does with those terms, so the expectation is about
 * the rows returned rather than the string. */
const fetchMatches = (storedInvoiceNo: string, terms: string[]) =>
  terms.some((term) => {
    const [, operator, value] = term.split(/\.(eq|like)\./).length === 3
      ? [null, term.includes(".like.") ? "like" : "eq", term.split(term.includes(".like.") ? ".like." : ".eq.")[1]]
      : [null, "eq", ""];
    return operator === "like"
      ? new RegExp(`^${value.replace(/\*/g, ".*")}$`).test(storedInvoiceNo)
      : storedInvoiceNo === value;
  });

ok("a lot stored as '26I02-0909' IS fetched", fetchMatches("26I02-0909", filters));
ok("a lot stored bare as '0909' IS fetched", fetchMatches("0909", filters));
ok("an unrelated lot '0910' is NOT fetched", !fetchMatches("0910", filters));
ok("an unrelated prefixed lot '26I02-0910' is NOT fetched", !fetchMatches("26I02-0910", filters));
ok("filters are built for every unexpected invoice", carryForwardInvoiceFilters(["0909", "0910"]).length === 4);

// ---------- Step 7: the rest of the document is untouched ----------

ok("every other invoice in the ACK is still catalogued against its own lot",
  recon.rows.filter((row) => row.status === "catalogued").length === invoiced.length,
  `${recon.rows.filter((row) => row.status === "catalogued").length} of ${invoiced.length}`);

console.log(failures === 0 ? "\nAll carry-forward / re-print register checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
