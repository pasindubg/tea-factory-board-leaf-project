// Minimal .xlsx reader: enough of the format to get a worksheet out as a grid
// of strings, and nothing more.
//
// An .xlsx is a zip of XML parts. Text cells do not hold their own text —
// they hold an index into a shared string table — and empty cells are simply
// absent from the XML, so a row's cells must be placed by their column
// reference ("D7") rather than by the order they appear in.
//
// Pure and dependency-light on purpose: this runs on a one-off owner import,
// and a full spreadsheet library would be a large permanent dependency for a
// single fixed sheet layout.
import { unzipSync, strFromU8 } from "fflate";

/** A worksheet as a dense grid. Missing cells are null, never undefined, so a
 * caller can index columns positionally without holes. */
export type SheetGrid = (string | null)[][];

/** Zero-based column index for an A1-style reference ("A" → 0, "AA" → 26). */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** Every `<t>` inside a shared-string item, concatenated — rich text splits one
 * string across several runs. */
function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((item) =>
    [...item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join(""),
  );
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

export type WorkbookSheet = { name: string; path: string };

/** The workbook's sheets in tab order, resolved to their part paths. */
function workbookSheets(files: Record<string, Uint8Array>): WorkbookSheet[] {
  const workbook = strFromU8(files["xl/workbook.xml"] ?? new Uint8Array());
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"] ?? new Uint8Array());
  const targetById = new Map(
    [...rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  return [...workbook.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => {
    const target = targetById.get(m[2]) ?? "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    return { name: decodeXml(m[1]), path };
  });
}

export type ReadSheetResult =
  | { ok: true; sheetNames: string[]; rows: SheetGrid }
  | { ok: false; error: string };

/**
 * Reads one worksheet into a grid.
 *
 * `sheetName` picks the tab; omitted, the first tab is used. Row numbers in
 * the file are 1-based and may skip entirely blank rows, so the grid is padded
 * to keep `rows[n]` aligned with spreadsheet row `n + 1` — an import that
 * reports "sheet row 243" has to mean the row the user sees.
 */
export function readSheet(data: Uint8Array, sheetName?: string): ReadSheetResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    return { ok: false, error: "That file could not be opened as a .xlsx workbook." };
  }
  if (!files["xl/workbook.xml"]) {
    return { ok: false, error: "That file is not an Excel workbook (no workbook part inside)." };
  }

  const sheets = workbookSheets(files);
  if (sheets.length === 0) return { ok: false, error: "The workbook contains no worksheets." };
  const sheet = sheetName
    ? sheets.find((candidate) => candidate.name.trim().toLowerCase() === sheetName.trim().toLowerCase())
    : sheets[0];
  const sheetNames = sheets.map((candidate) => candidate.name);
  if (!sheet) {
    return { ok: false, error: `The workbook has no sheet named "${sheetName}". It contains: ${sheetNames.join(", ")}.` };
  }
  const part = files[sheet.path];
  if (!part) return { ok: false, error: `Sheet "${sheet.name}" could not be read from the workbook.` };

  const strings = files["xl/sharedStrings.xml"] ? sharedStrings(strFromU8(files["xl/sharedStrings.xml"])) : [];
  const xml = strFromU8(part);
  const rows: SheetGrid = [];

  for (const rowMatch of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(rowMatch[1]);
    const cells: (string | null)[] = [];
    // A styled-but-empty cell is written self-closing (`<c r="K2" s="36"/>`).
    // Matching only `<c …>…</c>` makes such a cell's opening tag pair with the
    // NEXT cell's closing tag, so it adopts that cell's value and every column
    // after it shifts left — which silently reads the wrong column for the
    // rest of the row. The self-closing form is matched first for that reason.
    for (const cellMatch of rowMatch[2].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const ref = /r="([A-Z]+\d+)"/.exec(attributes)?.[1];
      if (!ref) continue;
      const type = /t="([^"]+)"/.exec(attributes)?.[1];
      const body = cellMatch[2] ?? "";
      let value: string | null = null;
      if (type === "inlineStr") {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join("");
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (raw != null) value = type === "s" ? strings[Number(raw)] ?? "" : decodeXml(raw);
      }
      const index = columnIndex(ref);
      while (cells.length <= index) cells.push(null);
      cells[index] = value;
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  }

  return { ok: true, sheetNames, rows };
}

/**
 * An Excel serial date as an ISO date.
 *
 * Serial 1 is 1900-01-01, but Excel also believes 1900 was a leap year, so the
 * usable epoch is 1899-12-30. Values outside a sane spreadsheet range return
 * null rather than a date in the year 200.
 */
export function excelSerialToISODate(value: string | number | null | undefined): string | null {
  const serial = Number(String(value ?? "").trim());
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.floor(serial) * 86400000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
