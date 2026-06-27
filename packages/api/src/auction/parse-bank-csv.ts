// Pure parser for a bank-statement CSV (docs/AUCTION.md §4④).
// Detects a typical Sri Lankan bank CSV with columns:
//   Date, Description, Debit, Credit, Running Balance, (optional Cheque No)
// Handles common formats — first row is a header (skipped by detection), amounts
// may include commas.
//
// Returns structured rows with a raw_line for auditing.

export type BankTxnRow = {
  txnDate: string;       // YYYY-MM-DD
  description: string;
  debit: number;
  credit: number;
  runningBalance: number | null;
  chequeNo: string | null;
  rawLine: string;       // original CSV line
};

export type ParsedBankCsv = {
  docType: "bank_csv";
  transactions: BankTxnRow[];
  issues: string[];
};

const num = (s: string) => {
  const n = Number(s.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

const toISODate = (s: string): string | null => {
  // dd/mm/yyyy → yyyy-mm-dd
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // yyyy-mm-dd already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
};

export function isBankCsv(text: string): boolean {
  const first = text.split("\n")[0]?.toLowerCase() ?? "";
  return /date.*descr|txn\s*date|value\s*date|posted/i.test(first);
}

export function parseBankCsv(rawText: string): ParsedBankCsv {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const issues: string[] = [];
  const transactions: BankTxnRow[] = [];

  // Skip header row (first line) if it looks like a header
  let startIdx = 0;
  if (lines.length > 0 && /date|txn|posted|value/i.test(lines[0])) {
    startIdx = 1;
  }

  // Detect delimiter: comma or tab
  const delim = lines[startIdx]?.includes("\t") ? "\t" : ",";

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i];
    const parts = raw.split(delim).map((p) => p.replace(/^"|"$/g, "").trim());

    if (parts.length < 3) {
      issues.push(`Line ${i + 1}: too few columns.`);
      continue;
    }

    // Heuristic: column 0 = date, column 1 = description, last two numeric
    // columns are debit/credit and running balance (may swap based on position).
    const dateStr = toISODate(parts[0]);
    if (!dateStr) {
      issues.push(`Line ${i + 1}: could not parse date "${parts[0]}".`);
      continue;
    }

    const desc = parts[1] ?? "";
    // Assume: debit is column 2, credit is column 3, balance is column 4 (if present)
    // Some banks swap debit/credit or omit one — detect by sign/non-zero.
    const col2 = num(parts[2] ?? "0");
    const col3 = num(parts[3] ?? "0");
    const col4 = parts.length > 4 ? num(parts[4]) : null;
    const col5 = parts.length > 5 ? parts[5] || null : null; // cheque_no column

    // Debit = col2 if col3 is 0, else both are populated
    const debit = col2 > 0 && col3 === 0 ? col2 : (col2 > 0 ? col2 : 0);
    const credit = col3 > 0 && col2 === 0 ? col3 : (col3 > 0 ? col3 : 0);

    transactions.push({
      txnDate: dateStr,
      description: desc,
      debit,
      credit,
      runningBalance: col4,
      chequeNo: col5,
      rawLine: raw,
    });
  }

  if (transactions.length === 0) issues.push("No transactions could be parsed.");

  return { docType: "bank_csv", transactions, issues };
}
