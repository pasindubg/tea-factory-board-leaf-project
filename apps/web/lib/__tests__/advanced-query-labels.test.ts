import { describe, expect, it } from "vitest";
import { canonicaliseAdvancedQuery } from "../../components/list-controls";

/**
 * An advanced query is filtered TWICE: in the browser, where the panel knows
 * each column's label, and on the server, which only ever sees row property
 * names. A query written with labels used to pass the first and be ignored by
 * the second — the list you looked at and the rows the server would return
 * disagreeing about the same criteria.
 *
 * Rewriting labels to keys the moment a query is applied is what keeps them
 * identical. These tests pin that rewrite.
 */
const columns = [
  { key: "state", label: "Lot state", accessor: (r: { state: string }) => r.state },
  { key: "netWt", label: "Net Weight", accessor: (r: { netWt: number }) => r.netWt },
  { key: "activeInvoice", label: "Active invoices", accessor: (r: { activeInvoice: boolean }) => r.activeInvoice },
  { key: "shutoutReason", label: "Shutout reason", accessor: (r: { shutoutReason: string }) => r.shutoutReason },
] as never[];

const canon = (q: string) => canonicaliseAdvancedQuery(q, columns);

describe("canonicaliseAdvancedQuery", () => {
  it("rewrites a label to its column key", () => {
    expect(canon("lotState!=Sold")).toBe("state!=Sold");
    expect(canon("Netweight>100")).toBe("netWt>100");
  });

  it("accepts a label with its spaces and punctuation exactly as the header shows it", () => {
    expect(canon('"Lot state:Valued"')).toBe("state:Valued");
    expect(canon('"Active invoices=Yes"')).toBe("activeInvoice=Yes");
  });

  it("ignores casing and separators — the header is a label, not an identifier", () => {
    expect(canon("LOTSTATE=Sold")).toBe("state=Sold");
    expect(canon("lot_state=Sold")).toBe("state=Sold");
    expect(canon("shutoutreason:Violation")).toBe("shutoutReason:Violation");
  });

  it("leaves a key that is already canonical alone", () => {
    expect(canon("state!=Sold netWt>100")).toBe("state!=Sold netWt>100");
  });

  it("keeps every operator, longest first so != survives", () => {
    for (const op of ["!=", "!:", ">=", "<=", "=", ">", "<", ":"]) {
      expect(canon(`lotState${op}Sold`)).toBe(`state${op}Sold`);
    }
  });

  it("re-quotes a value containing spaces so it survives re-tokenising", () => {
    expect(canon('"Shutout reason:Late arrival"')).toBe('shutoutReason:"Late arrival"');
  });

  // The way people actually type it. Splitting on whitespace first turned this
  // into three free-text tokens and silently returned nothing.
  it("accepts spaces around the operator", () => {
    expect(canon('lotState != "Sold"')).toBe("state!=Sold");
    expect(canon("lotState != Sold")).toBe("state!=Sold");
    expect(canon("netWt > 100")).toBe("netWt>100");
    expect(canon('"Lot state" != Sold')).toBe("state!=Sold");
    expect(canon('"Active invoices" = Yes')).toBe("activeInvoice=Yes");
  });

  it("keeps spaced and unspaced terms together in one query", () => {
    expect(canon('lotState != "Sold" netWt>100 Akmeemana'))
      .toBe("state!=Sold netWt>100 Akmeemana");
  });

  it("leaves free text and unknown keys exactly as typed", () => {
    expect(canon("Akmeemana")).toBe("Akmeemana");
    expect(canon("nosuchcolumn=1")).toBe("nosuchcolumn=1");
    expect(canon("")).toBe("");
  });

  it("canonicalises inside every OR branch and keeps the |", () => {
    expect(canon('lotState != "Sold" | Netweight > 100')).toBe("state!=Sold | netWt>100");
  });

  it("normalises & away — whitespace already means AND downstream", () => {
    expect(canon("lotState != Sold & Netweight > 100")).toBe("state!=Sold netWt>100");
    // A label with spaces must be quoted — unquoted, "Active invoices=Yes" is
    // indistinguishable from the free-text word "Active" followed by a term.
    expect(canon('lotState!=Sold & Netweight>100 | "Active invoices"=Yes'))
      .toBe("state!=Sold netWt>100 | activeInvoice=Yes");
  });

  it("canonicalises every token in a multi-term query", () => {
    expect(canon("lotState!=Sold Netweight>100 Akmeemana"))
      .toBe("state!=Sold netWt>100 Akmeemana");
  });
});
