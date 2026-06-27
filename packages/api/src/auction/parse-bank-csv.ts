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

export function isBankCsv(text: string): boolean {
  const first = text.split("\n")[0]?.toLowerCase() ?? "";
  const body = text.slice(0, 500).toLowerCase();
  return /transaction\s*history|txn\s*date|value\s*date|posted|transaction\s*date/.test(body);
}

export function parseBankCsv(rawText: string): ParsedBankCsv {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const issues: string[] = [];
  const transactions: BankTxnRow[] = [];

  // Detect header row — look for "Transaction Date" or similar to find the column line
  const headerIdx = lines.findIndex(
    (l) => /transaction\s*date/i.test(l) || /txn\s*date/i.test(l) || /value\s*date/i.test(l),
  );

  // Detect delimiter: comma or tab
  const sampleRow = lines[headerIdx >= 0 ? headerIdx + 1 : 0] ?? "";
  const delim = sampleRow.includes("\t") ? "\t" : ",";

  // Parse header to find column indices
  let dateCol = 1, descCol = 3, debitCol = 5, creditCol = 6, balanceCol = 7, chequeCol = 10;
  if (headerIdx >= 0) {
    const headers = lines[headerIdx].split(delim).map((h) => h.trim().toLowerCase());
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (/transaction\s*date|txn\s*date|value\s*date|posted/.test(h)) dateCol = i;
      else if (/description|narrative|particulars|details/.test(h)) descCol = i;
      else if (/debit|withdrawal|payment/.test(h) && !/credit/i.test(h)) debitCol = i;
      else if (/credit|deposit|incoming/.test(h)) creditCol = i;
      else if (/balance|running/.test(h)) balanceCol = i;
      else if (/cheque|ref/.test(h)) chequeCol = i;
    }
  }

  const toDate = (s: string): string | null => {
    const t = s.trim();
    const dmy = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    return null;
  };

  const n = (s: string) => {
    const x = Number((s ?? "").replace(/,/g, "").trim());
    return Number.isFinite(x) ? x : 0;
  };

  for (let i = (headerIdx >= 0 ? headerIdx + 1 : 0); i < lines.length; i++) {
    const raw = lines[i];
    const parts = raw.split(delim).map((p) => p.replace(/^"|"$/g, "").trim());

    // Skip rows that are clearly not transaction data (headers, notes)
    if (parts.every((p) => !p)) continue;
    if (/currency/i.test(parts.join(","))) continue;
    if (/page|statement/i.test(parts[0]?.toLowerCase() ?? "")) continue;

    const dateStr = toDate(parts[dateCol] ?? "");
    if (!dateStr) continue; // non-data row

    const debit = n(parts[debitCol] ?? "0");
    const credit = n(parts[creditCol] ?? "0");

    transactions.push({
      txnDate: dateStr,
      description: (parts[descCol] ?? "").replace(/\s+/g, " ").trim(),
      debit,
      credit,
      runningBalance: n(parts[balanceCol] ?? "0") || null,
      chequeNo: chequeCol < parts.length ? parts[chequeCol] || null : null,
      rawLine: raw,
    });
  }

  if (transactions.length === 0) issues.push("No transactions could be parsed.");

  return { docType: "bank_csv", transactions, issues };
}
