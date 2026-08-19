// Sellers Contract parsing across both broker layouts.
// Run: pnpm --dir packages/api test:contract
import { readFileSync } from "node:fs";
import { parseContract } from "./parse-contract";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}
const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

for (const [file, expected] of [
  ["contract-asia-siyaka.txt", ["2026/019/0139", "2026/019/0140"]],
  ["contract-asia-siyaka-sale-020.txt", ["2026/020/0146", "2026/020/0147"]],
  ["contract-bpml.txt", ["2026/019/0103", "2026/019/0104"]],
] as const) {
  const parsed = parseContract(fixture(file));
  const contractNos = parsed.contracts.map((c) => c.contractNo);
  ok(`${file}: contracts are unique`, new Set(contractNos).size === contractNos.length, contractNos.join(", "));
  ok(`${file}: expected contract list`, JSON.stringify(contractNos) === JSON.stringify(expected), contractNos.join(", "));
  ok(`${file}: every line carries a known contractNo`, parsed.lines.every((l) => contractNos.includes(l.contractNo)));
}

if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("All contract parsing checks passed.");
