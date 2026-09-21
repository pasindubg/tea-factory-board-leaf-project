import { describe, expect, it } from "vitest";
import { SALES_OVERVIEW_COLUMNS } from "../../app/dashboard/auction/sales/sales-overview-table";

describe("sales overview fields", () => {
  it("includes every sale-detail summary field once", () => {
    const keys = SALES_OVERVIEW_COLUMNS.map((column) => column.key);
    const labels = SALES_OVERVIEW_COLUMNS.map((column) => column.label);

    expect(new Set(keys).size).toBe(keys.length);
    expect(labels).toEqual(expect.arrayContaining([
      "Sale date",
      "Total kg to sale",
      "Lots sold",
      "Total valuation",
      "Sales valuation",
      "Total proceeds (before VAT)",
      "Average/kg (sold)",
      "Valuation variance",
      "Total deductions",
      "Total revenue",
      "Revenue/kg (sold)",
      "Bank credit (prompt)",
      "Total VAT",
      "Guarantee lots",
      "Issues",
      "Sellers contracts",
    ]));
  });
});
