// Broker-format detection, checked against the text of all SIX real sale-19
// documents — both houses × acknowledgement, valuation, sellers contract.
//
// Run: pnpm --dir packages/api test:broker-format
import { readFileSync } from "node:fs";
import { brokerDocumentMismatch, detectBrokerFormat } from "./broker-format";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

const DOCS = [
  { file: "ack-bpml.txt", broker: "BPML", label: "Acknowledgement" },
  { file: "ack-asia-siyaka.txt", broker: "ASIA SIYAKA", label: "Acknowledgement" },
  { file: "valuation-bpml.txt", broker: "BPML", label: "Valuation Report" },
  { file: "valuation-asia-siyaka.txt", broker: "ASIA SIYAKA", label: "Valuation Report" },
  { file: "contract-bpml.txt", broker: "BPML", label: "Sellers Contract" },
  { file: "contract-asia-siyaka.txt", broker: "ASIA SIYAKA", label: "Sellers Contract" },
] as const;

// ---------- Each real document is attributed to the right house ----------

for (const doc of DOCS) {
  const detected = detectBrokerFormat(fixture(doc.file));
  ok(`${doc.broker.padEnd(11)} ${doc.label.padEnd(16)} detected as ${doc.broker}`,
    detected.label === doc.broker, `${detected.label ?? "unknown"} (via ${detected.via})`);
}

// The BPML acknowledgement names no house at all — no trading name, no VAT,
// no address. It has to be recognised from its layout alone.
ok("the BPML acknowledgement is identified by LAYOUT, not by a name on the page",
  detectBrokerFormat(fixture("ack-bpml.txt")).via === "layout");

// ---------- Uploading to the right broker is allowed ----------

for (const doc of DOCS) {
  ok(`${doc.broker.padEnd(11)} ${doc.label.padEnd(16)} accepted for ${doc.broker}`,
    brokerDocumentMismatch(fixture(doc.file), doc.broker, doc.label) === null);
}

// ---------- Uploading to the WRONG broker is rejected ----------
//
// This is the reported bug: a BPML Sellers Contract was accepted into ASIA
// SIYAKA and only failed later as "12 contract lines could not be matched".

for (const doc of DOCS) {
  const wrongBroker = doc.broker === "BPML" ? "ASIA SIYAKA" : "BPML";
  const message = brokerDocumentMismatch(fixture(doc.file), wrongBroker, doc.label);
  ok(`${doc.broker.padEnd(11)} ${doc.label.padEnd(16)} REJECTED for ${wrongBroker}`,
    message !== null && message.includes(doc.broker) && message.includes(wrongBroker),
    message ?? "accepted (should have been rejected)");
}

console.log(`\nExample message:\n  ${brokerDocumentMismatch(fixture("contract-bpml.txt"), "ASIA SIYAKA", "Sellers Contract")}`);

// ---------- Unreadable / foreign documents ----------

const nonsense = "This is a delivery note from some other company entirely.";
ok("a document from neither house is reported as matching no known format",
  detectBrokerFormat(nonsense).format === null);
const unknownMessage = brokerDocumentMismatch(nonsense, "BPML", "Acknowledgement");
ok("…and is rejected naming both supported formats",
  unknownMessage !== null && unknownMessage.includes("BPML") && unknownMessage.includes("ASIA SIYAKA"),
  unknownMessage ?? "accepted");

// A broker this system has no format for cannot be checked, so its documents
// must not be blocked by a rule that only knows two houses.
ok("a document is allowed through for a broker with no known format",
  brokerDocumentMismatch(fixture("contract-bpml.txt"), "FORBES & WALKER", "Sellers Contract") === null);

console.log(failures === 0 ? "\nBROKER FORMAT GUARD: ALL CHECKS PASSED" : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
