/**
 * The key two grade spellings share when they are the SAME grade written
 * differently — case, spacing, punctuation, and the glyphs a handwritten book
 * confuses: the letter I for the digit 1, the letter O for the digit 0.
 *
 * Grades reach this factory two ways, and both used to be able to create a
 * twin of one already registered: the spreadsheet import created anything it
 * did not recognise as a new active grade, and the registry screen only had
 * the database's exact-match unique index behind it. So `BOPIA` was filed
 * beside `BOP1A` and `OP1` beside `OP 1` — pairs a dispatch manager cannot
 * tell apart in the picker, which the auction-data reset deliberately keeps,
 * and which nothing in the app would ever merge again.
 *
 * Folding is for MATCHING only; what gets stored is always the spelling the
 * factory chose. Checked against this factory's registered grades: it merges
 * exactly the two intended pairs and collides with nothing else.
 */
export const gradeMatchKey = (value: string) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/I/g, "1")
    .replace(/O/g, "0");
