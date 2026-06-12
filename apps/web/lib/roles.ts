// Single source of truth for role → module access (see docs/PRODUCT.md,
// "Modular architecture"). Adding a feature module = add its schema + route
// group, then register it here. Never inline role checks in pages.

export type Role = "owner" | "manager" | "collector";

export const ALL_WEB_ROLES: readonly Role[] = ["owner", "manager", "collector"];
export const MANAGEMENT_ROLES: readonly Role[] = ["owner", "manager"];

/**
 * Sellable bundles (see docs/PRODUCT.md "Sellable modules"). A factory's
 * subscription yields its enabled entitlement set; enforcement lands with M9's
 * checkout — until then every factory implicitly has all entitlements, but
 * every module must declare its key from day one.
 */
export type Entitlement = "leaf-handling" | "production" | "accounts";

export type ModuleDef = {
  href: string;
  label: string;
  roles: readonly Role[];
  entitlement: Entitlement;
};

export const MODULES: readonly ModuleDef[] = [
  { href: "/dashboard", label: "Overview", roles: MANAGEMENT_ROLES, entitlement: "leaf-handling" },
  { href: "/dashboard/weighings", label: "Weighings", roles: ALL_WEB_ROLES, entitlement: "leaf-handling" },
  { href: "/dashboard/suppliers", label: "Suppliers", roles: MANAGEMENT_ROLES, entitlement: "leaf-handling" },
  { href: "/dashboard/collectors", label: "Collectors", roles: MANAGEMENT_ROLES, entitlement: "leaf-handling" },
  { href: "/dashboard/users", label: "Users", roles: ["owner"], entitlement: "leaf-handling" },
];

export function modulesForRole(role: Role): readonly ModuleDef[] {
  return MODULES.filter((m) => m.roles.includes(role));
}

/** Where a role lands when it hits a page it isn't allowed to see. */
export function roleHome(role: Role): string {
  return role === "collector" ? "/dashboard/weighings" : "/dashboard";
}
