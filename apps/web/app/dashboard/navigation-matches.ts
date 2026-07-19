import type { ModuleDef } from "@/lib/roles";

/**
 * One route-matching contract for both sidebar highlighting and breadcrumbs.
 * Detail pages have dynamic IDs, so their module key—not only their href—is
 * used to identify the owning navigation destination.
 */
export function moduleMatchesPath(item: ModuleDef, pathname: string): boolean {
  if (item.key === "auction-sale-detail") return pathname.startsWith("/dashboard/auction/sales/");
  if (item.key === "auction-sales") return pathname === "/dashboard/auction/sales";
  if (item.key === "auction-reprints") return pathname === "/dashboard/auction/reprints";
  if (item.key === "auction-dispatch-detail") {
    return pathname.startsWith("/dashboard/auction/") &&
      !pathname.startsWith("/dashboard/auction/dashboard") &&
      !pathname.startsWith("/dashboard/auction/sales") &&
      !pathname.startsWith("/dashboard/auction/reprints") &&
      !pathname.startsWith("/dashboard/auction/reports") &&
      !pathname.startsWith("/dashboard/auction/registry") &&
      !pathname.startsWith("/dashboard/auction/settings") &&
      !pathname.startsWith("/dashboard/auction/dispatches") &&
      !pathname.startsWith("/dashboard/auction/warehouses") &&
      !pathname.startsWith("/dashboard/auction/new") &&
      pathname !== "/dashboard/auction";
  }
  if (item.key === "auction-dispatch-overview") return pathname === "/dashboard/auction/dispatches";
  if (item.key === "auction-bundled-dispatch-details") {
    return pathname === "/dashboard/auction/dispatches/details" ||
      (pathname.startsWith("/dashboard/auction/dispatches/") &&
        !pathname.startsWith("/dashboard/auction/dispatches/new") &&
        !pathname.startsWith("/dashboard/auction/dispatches/details"));
  }
  if (item.key === "auction") return pathname === "/dashboard/auction" || pathname.startsWith("/dashboard/auction/new");
  if (item.key === "overview") return pathname === "/dashboard";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function moduleForPath(nav: readonly ModuleDef[], pathname: string) {
  return [...nav]
    .filter((item) => moduleMatchesPath(item, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
