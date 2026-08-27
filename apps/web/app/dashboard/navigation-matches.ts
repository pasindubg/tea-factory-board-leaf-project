import type { ModuleDef } from "@/lib/roles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The Broker Invoice Details destination owns exactly two shapes: the
 * bootstrap route (/dashboard/auction/new) and a broker invoice's own detail
 * route, whose first segment is the invoice id (plus its /ack, /valuation,
 * /contract and /bank sub-routes).
 *
 * This is deliberately a shape test rather than "everything under
 * /dashboard/auction except <list>". That denylist had to be extended for
 * every new auction page and silently highlighted two sidebar entries at once
 * whenever someone forgot — which is exactly what happened when the Invoice
 * Overview page was added.
 */
function isBrokerInvoiceDetailPath(pathname: string): boolean {
  if (pathname === "/dashboard/auction/new") return true;
  const rest = pathname.startsWith("/dashboard/auction/")
    ? pathname.slice("/dashboard/auction/".length)
    : null;
  if (!rest) return false;
  return UUID.test(rest.split("/")[0] ?? "");
}

/**
 * One route-matching contract for both sidebar highlighting and breadcrumbs.
 * Detail pages have dynamic IDs, so their module key—not only their href—is
 * used to identify the owning navigation destination.
 */
export function moduleMatchesPath(item: ModuleDef, pathname: string): boolean {
  // Two addresses, one destination: the nav's stable entry point, and the
  // numbered URL a specific sale lives at once one is chosen.
  if (item.key === "auction-sale-detail") {
    return pathname === "/dashboard/auction/sales-details" || pathname.startsWith("/dashboard/auction/sales/");
  }
  if (item.key === "auction-sales") return pathname === "/dashboard/auction/sales";
  if (item.key === "auction-reprints") return pathname === "/dashboard/auction/reprints";
  if (item.key === "auction-dispatch-detail") return isBrokerInvoiceDetailPath(pathname);
  if (item.key === "auction-bundled-dispatch-details") {
    return pathname === "/dashboard/auction/dispatches/details" ||
      (pathname.startsWith("/dashboard/auction/dispatches/") &&
        !pathname.startsWith("/dashboard/auction/dispatches/details"));
  }
  if (item.key === "overview") return pathname === "/dashboard";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function moduleForPath(nav: readonly ModuleDef[], pathname: string) {
  return [...nav]
    .filter((item) => moduleMatchesPath(item, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
