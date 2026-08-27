/**
 * Extracts every broker PDF into the parser regression corpus.
 *
 * Run only when new documents arrive; the corpus itself is committed, so the
 * test suite never depends on a folder outside the repo:
 *
 *   pnpm --dir packages/api corpus:build "/path/to/Broker Reports"
 *
 * The extracted text is exactly what `extractPdf` feeds the parsers in
 * production (same unpdf call, same mergePages), so a document that parses
 * here parses in the app.
 */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getDocumentProxy, extractText } from "unpdf";

const CORPUS = new URL("../src/auction/__corpus__/", import.meta.url);

async function* pdfsIn(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* pdfsIn(full);
    else if (entry.name.toLowerCase().endsWith(".pdf")) yield full;
  }
}

/** "Acknoledgement/BPLM/MF1530 (BLACK024).pdf" → "acknoledgement__bplm__mf1530-black024.txt" */
function corpusName(root: string, path: string): string {
  return `${relative(root, path)
    .replace(/\.pdf$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}.txt`;
}

const root = process.argv[2];
if (!root) {
  console.error('Usage: tsx scripts/build-corpus.mts "/path/to/Broker Reports"');
  process.exit(1);
}

await mkdir(CORPUS, { recursive: true });
let written = 0;
for await (const path of pdfsIn(root)) {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(path)));
  const extracted = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(extracted.text) ? extracted.text.join(" ") : extracted.text;
  await writeFile(new URL(corpusName(root, path), CORPUS), text, "utf8");
  written += 1;
}
console.log(`corpus: ${written} document(s) written to src/auction/__corpus__/`);
