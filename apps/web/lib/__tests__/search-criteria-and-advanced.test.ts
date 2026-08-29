import { describe, expect, it } from "vitest";
import { filterRowsByAdvancedQuery, filterRowsByCriteria } from "../list-search-query";
import { canonicaliseAdvancedQuery } from "../../components/list-controls";

/**
 * The panel's own dropdowns and the advanced box must AND together. They are
 * enforced by two different functions in sequence, so a change to either can
 * silently drop the other's terms.
 */
const rows = [
  { id: "1", state: "Sold", activeInvoice: true, reprint: true },
  { id: "2", state: "Valued", activeInvoice: true, reprint: true },
  { id: "3", state: "Valued", activeInvoice: false, reprint: true },
  { id: "4", state: "Valued", activeInvoice: true, reprint: false },
];

const columns = [
  { key: "state", label: "Lot state", accessor: (r: (typeof rows)[number]) => r.state },
  { key: "activeInvoice", label: "Active invoices", accessor: (r: (typeof rows)[number]) => r.activeInvoice },
  { key: "reprint", label: "Re-print", accessor: (r: (typeof rows)[number]) => r.reprint },
] as never[];

describe("criteria AND advanced query", () => {
  it("applies both, in the order loadListResource does", () => {
    const criteria = { activeInvoice: "Yes", reprint: "Yes" };
    const advanced = canonicaliseAdvancedQuery('lotState != "Sold"', columns);
    const out = filterRowsByAdvancedQuery(filterRowsByCriteria(rows, criteria), advanced);
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  it("criteria alone still narrow the list", () => {
    expect(filterRowsByCriteria(rows, { activeInvoice: "Yes", reprint: "Yes" }).map((r) => r.id))
      .toEqual(["1", "2"]);
  });

  it("the advanced query alone still narrows the list", () => {
    expect(filterRowsByAdvancedQuery(rows, "state!=Sold").map((r) => r.id)).toEqual(["2", "3", "4"]);
  });

  it("a boolean criterion matches the Yes/No the column renders", () => {
    expect(filterRowsByCriteria(rows, { reprint: "No" }).map((r) => r.id)).toEqual(["4"]);
  });
});
