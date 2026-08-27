import { describe, expect, it } from "vitest";
import { formatSaleNo, saleNoMatches } from "../../app/dashboard/auction/sale-number";

describe("formatSaleNo", () => {
  it("always renders numeric sale values with four digits", () => {
    expect(formatSaleNo("21")).toBe("0021");
    expect(formatSaleNo("020")).toBe("0020");
    expect(formatSaleNo(7)).toBe("0007");
  });

  it("drops a broker's year prefix — it names the same sale, so showing it invents a distinction", () => {
    expect(formatSaleNo("2026-023")).toBe("0023");
    expect(formatSaleNo("2026-0021")).toBe("0021");
  });

  it("leaves a value with no digits alone rather than blanking it", () => {
    expect(formatSaleNo("none")).toBe("none");
    expect(formatSaleNo("")).toBe("");
    expect(formatSaleNo(null)).toBe("");
  });

  it("continues to match legacy and four-digit routes", () => {
    expect(saleNoMatches("021", "0021")).toBe(true);
  });
});
