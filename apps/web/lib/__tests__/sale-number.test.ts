import { describe, expect, it } from "vitest";
import { formatSaleNo, saleNoMatches } from "../../app/dashboard/auction/sale-number";

describe("formatSaleNo", () => {
  it("always renders numeric sale values with four digits", () => {
    expect(formatSaleNo("21")).toBe("0021");
    expect(formatSaleNo("020")).toBe("0020");
    expect(formatSaleNo(7)).toBe("0007");
  });

  it("preserves a broker prefix while formatting its final sale number", () => {
    expect(formatSaleNo("2026-023")).toBe("2026-0023");
  });

  it("continues to match legacy and four-digit routes", () => {
    expect(saleNoMatches("021", "0021")).toBe(true);
  });
});
