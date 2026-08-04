import { describe, expect, it } from "vitest";
import {
  buildCompositeInvoiceNo,
  invoiceSeqOf,
  parseCompositeInvoiceNo,
} from "../../app/dashboard/auction/invoice-number";

describe("invoiceSeqOf", () => {
  it("strips a prefix the edit form pre-filled", () => {
    expect(invoiceSeqOf("26I01-0003")).toBe("0003");
  });

  it("passes a bare sequence through untouched", () => {
    expect(invoiceSeqOf("0003")).toBe("0003");
    expect(invoiceSeqOf("3")).toBe("3");
  });

  it("handles blank input", () => {
    expect(invoiceSeqOf("")).toBe("");
    expect(invoiceSeqOf(null)).toBe("");
    expect(invoiceSeqOf(undefined)).toBe("");
  });

  it("keeps only the last segment even if already doubled", () => {
    // Repairing a value that was corrupted before the fix landed.
    expect(invoiceSeqOf("26I01-26I01-0003")).toBe("0003");
  });
});

describe("re-composing a submitted invoice number", () => {
  // The regression: every edit form pre-fills the stored composite, and
  // buildCompositeInvoiceNo used to prefix it a second time.
  const recompose = (submitted: string) => buildCompositeInvoiceNo("26I01", invoiceSeqOf(submitted));

  it("is idempotent — re-saving an unchanged lot keeps the same number", () => {
    expect(recompose("26I01-0003")).toBe("26I01-0003");
    expect(recompose(recompose("26I01-0003"))).toBe("26I01-0003");
  });

  it("still composes correctly from a bare sequence", () => {
    expect(recompose("0003")).toBe("26I01-0003");
    expect(recompose("3")).toBe("26I01-0003");
  });

  it("repairs an already-doubled value instead of compounding it", () => {
    expect(recompose("26I01-26I01-0003")).toBe("26I01-0003");
  });

  it("re-prefixes when the active prefix has moved on", () => {
    // A lot entered under 26I01 and edited while 26I02 is active adopts the
    // resolved prefix rather than keeping the stale one.
    expect(buildCompositeInvoiceNo("26I02", invoiceSeqOf("26I01-0003"))).toBe("26I02-0003");
  });
});

describe("parseCompositeInvoiceNo", () => {
  it("splits on the last dash", () => {
    expect(parseCompositeInvoiceNo("26I01-0003")).toEqual({ prefix: "26I01", seq: "0003" });
    expect(parseCompositeInvoiceNo("26I01-26I01-0003")).toEqual({ prefix: "26I01-26I01", seq: "0003" });
  });

  it("returns null when there is no prefix to split off", () => {
    expect(parseCompositeInvoiceNo("0003")).toBeNull();
    expect(parseCompositeInvoiceNo("")).toBeNull();
    expect(parseCompositeInvoiceNo("-0003")).toBeNull();
    expect(parseCompositeInvoiceNo("26I01-")).toBeNull();
  });
});
