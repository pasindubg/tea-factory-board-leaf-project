import { describe, expect, it } from "vitest";
import { MODULES } from "../roles";
import { moduleMatchesPath } from "../../app/dashboard/navigation-matches";

const moduleFor = (key: string) => {
  const found = MODULES.find((item) => item.key === key);
  if (!found) throw new Error(`No module registered for ${key}`);
  return found;
};

/** Every sidebar destination that claims this path. */
const matching = (pathname: string) =>
  MODULES.filter((item) => moduleMatchesPath(item, pathname)).map((item) => item.key);

describe("sidebar highlighting", () => {
  // A path matching two destinations lights up two entries at once, which is
  // what happened when Invoice Overview was added and the broker-invoice
  // matcher still claimed everything under /dashboard/auction/.
  it.each([
    "/dashboard/auction/invoices",
    "/dashboard/auction/new",
    "/dashboard/auction/reprints",
    "/dashboard/auction/warehouses",
    "/dashboard/auction/dispatches/details",
    "/dashboard/auction/invoice-prefixes",
    "/dashboard/auction/prefix-approvals",
    "/dashboard/auction/settings",
    "/dashboard/auction/registry",
    "/dashboard/auction/sales",
  ])("claims %s exactly once", (pathname) => {
    expect(matching(pathname)).toHaveLength(1);
  });

  it("keeps Invoice Overview and Broker Invoice Details separate", () => {
    expect(matching("/dashboard/auction/invoices")).toEqual(["auction-invoice-overview"]);
    expect(matching("/dashboard/auction/new")).toEqual(["auction-dispatch-detail"]);
  });

  it("still highlights Broker Invoice Details on a real invoice and its sub-routes", () => {
    const detail = moduleFor("auction-dispatch-detail");
    const id = "3f7c1a92-5b2e-4d18-9a63-0c8e4f1b7d55";
    expect(moduleMatchesPath(detail, `/dashboard/auction/${id}`)).toBe(true);
    expect(moduleMatchesPath(detail, `/dashboard/auction/${id}/ack/${id}`)).toBe(true);
    expect(moduleMatchesPath(detail, `/dashboard/auction/${id}/valuation/${id}`)).toBe(true);
  });

  it("does not treat a new static auction page as a broker invoice id", () => {
    // The guarantee that replaced the old denylist: a slug is not a UUID, so a
    // page added later cannot accidentally be claimed by the detail route.
    const detail = moduleFor("auction-dispatch-detail");
    expect(moduleMatchesPath(detail, "/dashboard/auction/invoices")).toBe(false);
    expect(moduleMatchesPath(detail, "/dashboard/auction/some-future-page")).toBe(false);
  });

  it("keeps the sales overview and sales detail destinations distinct", () => {
    expect(matching("/dashboard/auction/sales")).toEqual(["auction-sales"]);
    expect(matching("/dashboard/auction/sales/0019")).toEqual(["auction-sale-detail"]);
  });
});
