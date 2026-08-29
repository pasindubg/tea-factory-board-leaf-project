/**
 * Boolean grouping for the advanced query language, shared by the browser
 * panel and the server-side enforcement so the two cannot disagree.
 *
 *   a b        AND (whitespace has always meant AND)
 *   a & b      AND, written explicitly
 *   a | b      OR
 *
 * `&` binds tighter than `|`, as in SQL: `a & b | c` is `(a AND b) OR c`.
 * There is no bracketing — a flat sum of products is the whole grammar, which
 * covers what a list filter needs without becoming an expression parser.
 *
 * Splitting returns each OR branch as an ordinary AND-only query string, so
 * every existing tier keeps its own tokenising and matching unchanged and only
 * has to ask "does any branch match?".
 */

/** Splits on `ch`, ignoring occurrences inside double quotes. */
function splitOutsideQuotes(query: string, ch: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote = false;
  for (const c of query) {
    if (c === '"') inQuote = !inQuote;
    if (!inQuote && c === ch) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts;
}

/**
 * The OR branches of a query, each an AND-only query string. Always at least
 * one entry, so a caller can treat "no OR" as the single-branch case rather
 * than special-casing it.
 */
export function splitAdvancedQueryGroups(query: string | null | undefined): string[] {
  const text = (query ?? "").trim();
  if (!text) return [];
  return splitOutsideQuotes(text, "|")
    // `&` is just an explicit AND, and whitespace already means AND — so
    // turning it into a space hands the branch to the existing tokeniser
    // unchanged.
    .map((branch) =>
      splitOutsideQuotes(branch, "&")
        .map((term) => term.trim())
        .filter((term) => term !== "")
        .join(" "),
    )
    .filter((branch) => branch !== "");
}

/** True when the query uses OR, i.e. it cannot be enforced as a flat AND. */
export function hasOrBranches(query: string | null | undefined): boolean {
  return splitAdvancedQueryGroups(query).length > 1;
}
