// Which broker's stationery a document is printed on.
//
// Every broker document is uploaded AGAINST a broker: the operator picks the
// sale and broker, then attaches the PDF. Nothing checked that the PDF was
// actually that broker's, so a BPML Sellers Contract dropped into ASIA SIYAKA
// staged happily and only failed much later as "12 contract lines could not be
// matched to a lot in this broker sale" — an invoice-matching error for what is
// really a wrong-file mistake. This catches it at upload.
//
// Pure & framework-free. The markers are the SAME ones the parsers branch on
// (see parseAcknowledgement, parseValuation, parseContract), so detection
// cannot drift away from what the parser would then do with the file.

export type BrokerFormatId = "asia-siyaka" | "bpml";

type BrokerFormat = {
  id: BrokerFormatId;
  /** How the house is named to the operator. */
  label: string;
  /** Matches the factory's registered broker NAME for this house. */
  nameAlias: RegExp;
  /**
   * The house identifying itself on the page — trading name, VAT number, or
   * office address. Strongest signal, and present on most documents.
   */
  identity: RegExp[];
  /**
   * Layout fingerprints, for documents that never name the house at all. The
   * BPML acknowledgement is exactly this: no name, no VAT, no address — only
   * its own unmistakable "Tot.No. Of Lots Catalogued" summary line.
   */
  layout: RegExp[];
};

const FORMATS: BrokerFormat[] = [
  {
    id: "asia-siyaka",
    label: "ASIA SIYAKA",
    nameAlias: /asia\s*siyaka/i,
    identity: [/Asia\s+Siyaka\s+Commodities/i, /\btbBOSS\b/, /114206369/, /JAYAH\s+MAWATHA/i],
    layout: [/We give details of Teas in our catalogue/i, /VALUATION\s*&\s*MUSTER REPORT/i],
  },
  {
    id: "bpml",
    label: "BPML",
    nameAlias: /\bbpml\b/i,
    identity: [/BPML\s+Produce\s+Marketing/i, /Veluwana\s+Place/i, /114107670/],
    layout: [/Tot\.No\. Of Lots Catalogued/, /\bValuation Report\b/i],
  },
];

export type BrokerFormatDetection = {
  /** null when the document matches no known house, or more than one. */
  format: BrokerFormatId | null;
  label: string | null;
  /** `identity` = the document names the house; `layout` = inferred from its
   * layout alone; `unknown` = neither, or ambiguous. */
  via: "identity" | "layout" | "unknown";
};

const UNKNOWN: BrokerFormatDetection = { format: null, label: null, via: "unknown" };

/** Every broker format this system can read, for error messages. */
export function knownBrokerFormatLabels(): string[] {
  return FORMATS.map((format) => format.label);
}

/**
 * Identity is tried before layout across ALL formats, so a document that names
 * its house always wins over one that merely looks like a layout — and a
 * document matching two houses is reported unknown rather than guessed at.
 */
export function detectBrokerFormat(text: string): BrokerFormatDetection {
  const byIdentity = FORMATS.filter((format) => format.identity.some((marker) => marker.test(text)));
  if (byIdentity.length === 1) return { format: byIdentity[0].id, label: byIdentity[0].label, via: "identity" };
  if (byIdentity.length > 1) return UNKNOWN;

  const byLayout = FORMATS.filter((format) => format.layout.some((marker) => marker.test(text)));
  if (byLayout.length === 1) return { format: byLayout[0].id, label: byLayout[0].label, via: "layout" };
  return UNKNOWN;
}

/** Whether a detected format is the factory's registered broker of that name. */
export function brokerFormatMatchesName(format: BrokerFormatId, brokerName: string): boolean {
  const entry = FORMATS.find((candidate) => candidate.id === format);
  return entry ? entry.nameAlias.test(brokerName) : false;
}

/**
 * The upload guard. Returns an operator-facing message when the document does
 * not belong to `brokerName`, or null when it is fine to stage.
 *
 * Deliberately permissive in one direction: a broker the factory registered
 * that this system has no format for yet (a third house) cannot be checked, so
 * its documents are allowed through rather than blocked by a rule that only
 * knows two brokers. Only a POSITIVE mismatch — the document is demonstrably a
 * different known house — and an unreadable format are rejected.
 */
export function brokerDocumentMismatch(
  text: string,
  brokerName: string,
  documentLabel: string,
): string | null {
  const detected = detectBrokerFormat(text);
  const known = knownBrokerFormatLabels();

  if (!detected.format || !detected.label) {
    return `This ${documentLabel} doesn't match the ${known.join(" or ")} document format. Check the file is the right broker's document.`;
  }
  if (brokerFormatMatchesName(detected.format, brokerName)) return null;

  // The upload target is a house this system does have a format for, and the
  // document is a different one — a genuine wrong-file mistake.
  const targetIsKnown = FORMATS.some((format) => format.nameAlias.test(brokerName));
  if (!targetIsKnown) return null;

  const article = /^[AEIOU]/i.test(detected.label) ? "an" : "a";
  return `This is ${article} ${detected.label} ${documentLabel}, but you're uploading it to ${brokerName}. Upload the ${brokerName} document instead.`;
}
