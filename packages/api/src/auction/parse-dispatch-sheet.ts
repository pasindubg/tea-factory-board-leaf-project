// The factory's own "Dispatch Schedule" spreadsheet — the book it kept before
// this system existed. Parsed so a go-live import can replay those invoices
// through the ordinary Invoice Overview flow.
//
// Pure: this only turns a worksheet grid into typed rows and says why it
// rejected the ones it rejected. Nothing here writes; the caller applies each
// row through the real server actions so the application's own validation is
// what decides whether a row is acceptable.
import { excelSerialToISODate, type SheetGrid } from "./read-xlsx";

/** Columns of the Dispatch Schedule sheet, by position. */
const COLUMN = {
  dispatchDate: 0,
  saleDate: 1,
  broker: 2,
  invoiceNo: 3,
  bags: 4,
  kgPerBag: 5,
  sampleWeight: 6,
  netWeight: 7,
  grade: 8,
  mark: 9,
  saleNo: 11,
  nextSaleNo: 12,
  check: 13,
  lotNo: 14,
  additionalSampleWeight: 15,
} as const;

export const DISPATCH_SHEET_NAME = "Dispatch Schedule";

/** Header labels expected in row 1, used to refuse the wrong workbook. */
const REQUIRED_HEADERS = ["Dispatch Date", "Broker", "Invoice No.", "Bags", "Grade", "Mark"];

/** The factory writes brokers as initials. */
const BROKER_ALIASES: Record<string, string> = {
  "A/S": "ASIA SIYAKA",
  AS: "ASIA SIYAKA",
  "B/L": "BPML",
  BL: "BPML",
};

/** Marks are written by name; the system keys them by code. */
const MARK_ALIASES: Record<string, string> = {
  KUMUDU: "MF1530",
  ITTAPANA: "MF1530A",
};

export type DispatchSheetRow = {
  /** 1-based spreadsheet row, so a report points at what the user can see. */
  sheetRow: number;
  /**
   * Null only for a re-print carried over from before the system: those sit at
   * the end of the book as a running list and were never dispatched from here,
   * so the book records no dispatch date for them. The importer supplies a
   * cutover date when it registers them.
   */
  dispatchDate: string | null;
  saleDate: string | null;
  brokerName: string;
  markCode: string;
  invoiceNo: string;
  bags: number;
  kgPerBag: number;
  sampleWeightKg: number;
  grade: string;
  lotNo: string | null;
  /** The sale this lot was first offered in. */
  saleNo: string | null;
  /** The sale it moved to, or sold in — a re-print's second sale number. */
  nextSaleNo: string | null;
  /** The sheet's "Check" column marks a re-print. */
  isReprint: boolean;
  additionalSampleKg: number;
};

export type SkippedSheetRow = {
  sheetRow: number;
  invoiceNo: string | null;
  reason: string;
};

export type ParsedDispatchSheet = {
  rows: DispatchSheetRow[];
  skipped: SkippedSheetRow[];
  /** Grade spellings in the sheet, for the caller to resolve against its own
   * grade list and aliases before importing. */
  gradeSpellings: string[];
  issues: string[];
};

const text = (value: string | null | undefined) => String(value ?? "").trim();

/** Excel stores every number as a float, so "901.0" is how an invoice number
 * arrives. Trailing ".0" is formatting, not part of the reference. */
function sheetNumberText(value: string | null | undefined): string {
  const raw = text(value);
  if (!raw) return "";
  return /^\d+\.0+$/.test(raw) ? raw.replace(/\.0+$/, "") : raw;
}

function sheetNumber(value: string | null | undefined): number | null {
  const raw = text(value).replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Sale numbers arrive as "19", "19.0" or blank. */
function saleNumber(value: string | null | undefined): string | null {
  const raw = sheetNumberText(value);
  if (!raw) return null;
  const digits = /^\d+$/.test(raw) ? raw : /(\d+)/.exec(raw)?.[1];
  return digits ? String(Number(digits)) : null;
}

export function normalizeBrokerName(value: string): string {
  const raw = value.trim().toUpperCase();
  return BROKER_ALIASES[raw] ?? value.trim();
}

export function normalizeMarkCode(value: string): string {
  const raw = value.trim().toUpperCase();
  return MARK_ALIASES[raw] ?? value.trim();
}

/** Header row present and recognisable, so the wrong workbook is refused up
 * front rather than producing 300 confusing row errors. */
export function looksLikeDispatchSheet(grid: SheetGrid): boolean {
  const header = (grid[0] ?? []).map((cell) => text(cell).toLowerCase());
  return REQUIRED_HEADERS.every((label) => header.includes(label.toLowerCase()));
}

/**
 * Turns the sheet into rows the importer can apply.
 *
 * A row is only importable when it carries everything an invoice entry needs:
 * broker, mark, grade, invoice number, bags and kg/bag. The book also holds
 * partial working rows, a stray list of invoice numbers, and buyer-return
 * notes — each is skipped WITH ITS REASON rather than dropped, so the operator
 * can see exactly what did not come across and why.
 */
export function parseDispatchSheet(grid: SheetGrid): ParsedDispatchSheet {
  const rows: DispatchSheetRow[] = [];
  const skipped: SkippedSheetRow[] = [];
  const issues: string[] = [];
  const gradeSpellings = new Set<string>();

  if (!looksLikeDispatchSheet(grid)) {
    issues.push(`This does not look like a "${DISPATCH_SHEET_NAME}" sheet — its header row is missing columns such as ${REQUIRED_HEADERS.join(", ")}.`);
    return { rows, skipped, gradeSpellings: [], issues };
  }

  for (let index = 1; index < grid.length; index += 1) {
    const cells = grid[index] ?? [];
    const sheetRow = index + 1;
    const at = (column: number) => text(cells[column]);

    const invoiceNo = sheetNumberText(cells[COLUMN.invoiceNo]);
    if (!invoiceNo) continue; // genuinely blank spreadsheet row

    const check = at(COLUMN.check);
    const skip = (reason: string) => skipped.push({ sheetRow, invoiceNo, reason });

    if (/buyer\s*return/i.test(check)) {
      skip(`Buyer return note, not a dispatch: "${check}"`);
      continue;
    }

    const brokerRaw = at(COLUMN.broker);
    const markRaw = at(COLUMN.mark);
    const gradeRaw = at(COLUMN.grade);
    const missing: string[] = [];
    if (!brokerRaw) missing.push("broker");
    if (!markRaw) missing.push("mark");
    if (!gradeRaw) missing.push("grade");
    if (missing.length > 0) {
      skip(`Row has no ${missing.join(", ")}`);
      continue;
    }

    const bags = sheetNumber(cells[COLUMN.bags]);
    const kgPerBag = sheetNumber(cells[COLUMN.kgPerBag]);
    if (!bags || bags <= 0 || !kgPerBag || kgPerBag <= 0) {
      skip("Row has no bags or weight per bag");
      continue;
    }

    const isReprint = /^re-?print$/i.test(check);
    const dispatchDate = excelSerialToISODate(cells[COLUMN.dispatchDate]);
    // An ordinary invoice must state when it was dispatched. An outstanding
    // re-print never was — it is already sitting at the broker — so it is
    // allowed through without one and registered at cutover instead.
    if (!dispatchDate && !isReprint) {
      skip("Row has no readable dispatch date");
      continue;
    }

    gradeSpellings.add(gradeRaw);
    rows.push({
      sheetRow,
      dispatchDate,
      saleDate: excelSerialToISODate(cells[COLUMN.saleDate]),
      brokerName: normalizeBrokerName(brokerRaw),
      markCode: normalizeMarkCode(markRaw),
      invoiceNo,
      bags,
      kgPerBag,
      sampleWeightKg: sheetNumber(cells[COLUMN.sampleWeight]) ?? 0,
      grade: gradeRaw,
      lotNo: sheetNumberText(cells[COLUMN.lotNo]) || null,
      saleNo: saleNumber(cells[COLUMN.saleNo]),
      nextSaleNo: saleNumber(cells[COLUMN.nextSaleNo]),
      isReprint,
      additionalSampleKg: sheetNumber(cells[COLUMN.additionalSampleWeight]) ?? 0,
    });
  }

  if (rows.length === 0) issues.push("No importable rows were found in this sheet.");
  return { rows, skipped, gradeSpellings: [...gradeSpellings].sort(), issues };
}
