// The factory's own "Dispatch Schedule" spreadsheet — the book it kept before
// this system existed. Parsed so a go-live import can replay those invoices
// through the ordinary Invoice Overview flow.
//
// Pure: this only turns a worksheet grid into typed rows and says why it
// rejected the ones it rejected. Nothing here writes; the caller applies each
// row through the real server actions so the application's own validation is
// what decides whether a row is acceptable.
import { excelSerialToISODate, type SheetGrid } from "./read-xlsx";

/**
 * The headings each column is found by — never its position. The book is a
 * working spreadsheet: a revision inserted a numbering column in front of
 * everything and a "Reprint" column in the middle, which silently shifts every
 * fixed index. Where a heading has been renamed between revisions, the
 * spellings are listed newest first.
 */
const COLUMN_LABELS = {
  dispatchDate: ["Dispatch Date"],
  saleDate: ["Sale Date (Planned)", "Sale Date"],
  broker: ["Broker"],
  invoiceNo: ["Invoice No."],
  bags: ["Bags"],
  kgPerBag: ["Weight / Bag"],
  sampleWeight: ["Sample Weight"],
  grade: ["Grade"],
  mark: ["Mark"],
  saleNo: ["Sale No."],
  nextSaleNo: ["Next Sale No."],
  check: ["Check"],
  lotNo: ["Lot No."],
} as const;

type ColumnField = keyof typeof COLUMN_LABELS;
type ColumnMap = Partial<Record<ColumnField, number>>;

export const DISPATCH_SHEET_NAME = "Dispatch Schedule";

/** No row can become an invoice without these, so a sheet missing any of them
 * is refused as the wrong workbook. */
const REQUIRED_COLUMNS: ColumnField[] = ["dispatchDate", "broker", "invoiceNo", "bags", "kgPerBag", "grade", "mark"];

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
  dispatchDate: string;
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
  /** The sale it moved to — read only as a fallback when the book leaves the
   * first sale blank. The move itself is not imported: a re-print is evidenced
   * by the later sale's acknowledgement, never declared from this book. */
  nextSaleNo: string | null;
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

/** Headings are compared on letters and digits alone, so "Invoice No." and
 * "Invoice No" are the same column. */
const headerKey = (value: string | null | undefined) => text(value).toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The heading row — the first row that names every required column — and where
 * each column sits in it.
 *
 * Null when no row does, which refuses the wrong workbook up front rather than
 * producing 300 confusing row errors.
 */
function findColumns(grid: SheetGrid): { row: number; columns: ColumnMap } | null {
  for (let index = 0; index < grid.length; index += 1) {
    const keys = (grid[index] ?? []).map(headerKey);
    const columns: ColumnMap = {};
    for (const field of Object.keys(COLUMN_LABELS) as ColumnField[]) {
      for (const label of COLUMN_LABELS[field]) {
        const at = keys.indexOf(headerKey(label));
        if (at >= 0) {
          columns[field] = at;
          break;
        }
      }
    }
    if (REQUIRED_COLUMNS.every((field) => columns[field] !== undefined)) return { row: index, columns };
  }
  return null;
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

  const header = findColumns(grid);
  if (!header) {
    issues.push(`This does not look like a "${DISPATCH_SHEET_NAME}" sheet — its header row is missing columns such as ${REQUIRED_COLUMNS.map((field) => COLUMN_LABELS[field][0]).join(", ")}.`);
    return { rows, skipped, gradeSpellings: [], issues };
  }

  for (let index = header.row + 1; index < grid.length; index += 1) {
    const cells = grid[index] ?? [];
    const sheetRow = index + 1;
    const cell = (field: ColumnField) => {
      const column = header.columns[field];
      return column === undefined ? null : cells[column] ?? null;
    };
    const at = (field: ColumnField) => text(cell(field));

    const invoiceNo = sheetNumberText(cell("invoiceNo"));
    if (!invoiceNo) continue; // genuinely blank spreadsheet row

    const check = at("check");
    const skip = (reason: string) => skipped.push({ sheetRow, invoiceNo, reason });

    if (/buyer\s*return/i.test(check)) {
      skip(`Buyer return note, not a dispatch: "${check}"`);
      continue;
    }

    const brokerRaw = at("broker");
    const markRaw = at("mark");
    const gradeRaw = at("grade");
    const missing: string[] = [];
    if (!brokerRaw) missing.push("broker");
    if (!markRaw) missing.push("mark");
    if (!gradeRaw) missing.push("grade");
    if (missing.length > 0) {
      skip(`Row has no ${missing.join(", ")}`);
      continue;
    }

    const bags = sheetNumber(cell("bags"));
    const kgPerBag = sheetNumber(cell("kgPerBag"));
    if (!bags || bags <= 0 || !kgPerBag || kgPerBag <= 0) {
      skip("Row has no bags or weight per bag");
      continue;
    }

    const dispatchDate = excelSerialToISODate(cell("dispatchDate"));
    if (!dispatchDate) {
      skip("Row has no readable dispatch date");
      continue;
    }

    gradeSpellings.add(gradeRaw);
    rows.push({
      sheetRow,
      dispatchDate,
      saleDate: excelSerialToISODate(cell("saleDate")),
      brokerName: normalizeBrokerName(brokerRaw),
      markCode: normalizeMarkCode(markRaw),
      invoiceNo,
      bags,
      kgPerBag,
      sampleWeightKg: sheetNumber(cell("sampleWeight")) ?? 0,
      grade: gradeRaw,
      lotNo: sheetNumberText(cell("lotNo")) || null,
      saleNo: saleNumber(cell("saleNo")),
      nextSaleNo: saleNumber(cell("nextSaleNo")),
    });
  }

  if (rows.length === 0) issues.push("No importable rows were found in this sheet.");
  return { rows, skipped, gradeSpellings: [...gradeSpellings].sort(), issues };
}
