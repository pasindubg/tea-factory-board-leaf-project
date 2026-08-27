import { describe, expect, it } from "vitest";
import { formatFourDigitNo, formatSaleNo, saleNoKey, saleNoMatches } from "../../app/dashboard/auction/sale-number";
import { buildCompositeInvoiceNo, invoiceSeqOf, parseCompositeInvoiceNo } from "../../app/dashboard/auction/invoice-number";

/**
 * Two formatters, two OPPOSITE contracts. They were identical once, and the
 * confusion has cost real bugs:
 *
 *   - a sale number rendered "2026-0021" because the sale formatter kept a
 *     prefix that names nothing;
 *   - an invoice registered as "0901" instead of "26I02-0901" because a
 *     registration path formatted it as if the prefix were noise.
 *
 * A prefix on an INVOICE is identity — it is the factory's index cycle, and two
 * invoices with the same sequence in different cycles are different invoices.
 * A prefix on a SALE number is decoration a broker printed; saleNoKey has
 * always compared them prefix-blind. These tests keep them from converging.
 */
describe("sale numbers drop their prefix", () => {
  it("renders four digits whatever the spelling", () => {
    expect(formatSaleNo("21")).toBe("0021");
    expect(formatSaleNo("021")).toBe("0021");
    expect(formatSaleNo("0021")).toBe("0021");
    expect(formatSaleNo(21)).toBe("0021");
  });

  it("strips a broker's year prefix", () => {
    expect(formatSaleNo("2026-021")).toBe("0021");
    expect(formatSaleNo("2026-0021")).toBe("0021");
  });

  it("agrees with the matcher that has always been prefix-blind", () => {
    expect(saleNoKey("2026-021")).toBe(saleNoKey("21"));
    expect(saleNoMatches("2026-021", "0021")).toBe(true);
    expect(formatSaleNo("2026-021")).toBe(formatSaleNo("21"));
  });

  it("passes through a value with no digits instead of blanking it", () => {
    expect(formatSaleNo("none")).toBe("none");
    expect(formatSaleNo("")).toBe("");
    expect(formatSaleNo(null)).toBe("");
    expect(formatSaleNo(undefined)).toBe("");
  });
});

describe("invoice numbers KEEP their prefix", () => {
  it("pads the sequence without touching the index cycle", () => {
    expect(formatFourDigitNo("26I02-901")).toBe("26I02-0901");
    expect(formatFourDigitNo("26I02-0901")).toBe("26I02-0901");
    expect(formatFourDigitNo("901")).toBe("0901");
  });

  it("never collapses two cycles onto the same number", () => {
    expect(formatFourDigitNo("26I01-0001")).not.toBe(formatFourDigitNo("26I02-0001"));
  });

  it("is deliberately different from the sale formatter", () => {
    expect(formatFourDigitNo("2026-021")).toBe("2026-0021");
    expect(formatSaleNo("2026-021")).toBe("0021");
  });
});

describe("composite invoice helpers", () => {
  it("round-trips a composite number", () => {
    const composite = buildCompositeInvoiceNo("26I02", "901");
    expect(composite).toBe("26I02-0901");
    expect(parseCompositeInvoiceNo(composite)).toEqual({ prefix: "26I02", seq: "0901" });
  });

  it("splits on the LAST dash, so a prefix containing one still parses", () => {
    expect(parseCompositeInvoiceNo("26-I02-0901")).toEqual({ prefix: "26-I02", seq: "0901" });
  });

  it("returns null for something that is not composite", () => {
    expect(parseCompositeInvoiceNo("0901")).toBeNull();
    expect(parseCompositeInvoiceNo("")).toBeNull();
    expect(parseCompositeInvoiceNo(null)).toBeNull();
  });

  it("never double-prefixes a value fed back from a form", () => {
    // The bug this guards: an edit form pre-fills the full composite, and
    // re-composing it stored "26I02-26I02-0901".
    expect(buildCompositeInvoiceNo("26I02", invoiceSeqOf("26I02-0901"))).toBe("26I02-0901");
    expect(invoiceSeqOf("26I02-0901")).toBe("0901");
    expect(invoiceSeqOf("0901")).toBe("0901");
  });
});
