// Single source of truth for role → module access (see docs/PRODUCT.md,
// "Modular architecture"). Adding a feature module = add its schema + route
// group, then register it here. Never inline role checks in pages.

// `supplier` and `driver` are Phase-2 field-app roles (issue #13): they sign in
// on mobile via phone OTP and get NO web modules — they appear in the union (and
// ROLE_LABELS) so the shared DB role type stays in sync, but are deliberately
// absent from ALL_WEB_ROLES and every MODULES entry.
export type Role = "owner" | "manager" | "supervisor" | "accountant" | "collector" | "supplier" | "driver";

export const ALL_WEB_ROLES: readonly Role[] = ["owner", "manager", "supervisor", "accountant", "collector"];
export const MANAGEMENT_ROLES: readonly Role[] = ["owner", "manager"];

/**
 * Sellable bundles (see docs/PRODUCT.md "Sellable modules"). A factory's
 * subscription yields its enabled entitlement set; enforcement lands with M9's
 * checkout — until then every factory implicitly has all entitlements, but
 * every module must declare its key from day one.
 */
export type Entitlement = "leaf-handling" | "auction" | "production" | "accounts";

// Sidebar sections. Overview has no group (it sits above the sections); every
// other module belongs to one. Sections render in this order.
export type ModuleGroup = "Leaf Handling" | "Sales Handling" | "Dispatch Handling";
export const MODULE_GROUP_ORDER: readonly ModuleGroup[] = ["Leaf Handling", "Sales Handling", "Dispatch Handling"];

export type ModuleDef = {
  key: string;
  href: string;
  label: string;
  roles: readonly Role[];
  entitlement: Entitlement;
  group?: ModuleGroup;
  subGroup?: string;
};

// Default access per module. Per-factory overrides are stored in module_permissions
// and read at runtime by requireModuleAccess(). Owner always has access to everything.
export const MODULES: readonly ModuleDef[] = [
  {
    key: "overview",
    href: "/dashboard",
    label: "Overview",
    roles: ["owner", "manager", "supervisor", "accountant"],
    entitlement: "leaf-handling",
  },
  {
    key: "weighings",
    href: "/dashboard/weighings",
    label: "Weighings",
    roles: ALL_WEB_ROLES,
    entitlement: "leaf-handling",
    group: "Leaf Handling",
  },
  {
    key: "suppliers",
    href: "/dashboard/suppliers",
    label: "Suppliers",
    roles: ["owner", "manager", "supervisor", "accountant"],
    entitlement: "leaf-handling",
    group: "Leaf Handling",
  },
  {
    key: "collectors",
    href: "/dashboard/collectors",
    label: "Collectors",
    roles: ["owner", "manager", "supervisor"],
    entitlement: "leaf-handling",
    group: "Leaf Handling",
  },
  {
    key: "requests",
    href: "/dashboard/requests",
    label: "Requests",
    roles: ["owner", "manager", "supervisor"],
    entitlement: "leaf-handling",
    group: "Leaf Handling",
  },
  {
    key: "messages",
    href: "/dashboard/messages",
    label: "Messages",
    roles: ["owner", "manager", "supervisor"],
    entitlement: "leaf-handling",
    group: "Leaf Handling",
  },
  {
    key: "payments",
    href: "/dashboard/payments",
    label: "Payments",
    roles: ["owner", "manager", "accountant"],
    entitlement: "leaf-handling",
    group: "Leaf Handling",
  },
  {
    key: "users",
    href: "/dashboard/users",
    label: "Users",
    roles: ["owner"],
    entitlement: "leaf-handling",
  },
  {
    key: "auction-dashboard",
    href: "/dashboard/auction/dashboard",
    label: "Dashboard",
    roles: ["owner", "manager", "accountant"],
    entitlement: "auction",
    group: "Sales Handling",
  },
  {
    key: "auction-sales",
    href: "/dashboard/auction/sales",
    label: "Sales Overview",
    roles: ["owner", "manager", "accountant"],
    entitlement: "auction",
    group: "Sales Handling",
  },
  {
    key: "auction-sale-detail",
    href: "/dashboard/auction/sales",
    label: "Sales Detail",
    roles: ["owner", "manager", "accountant"],
    entitlement: "auction",
    group: "Sales Handling",
  },
  {
    key: "auction-reports",
    href: "/dashboard/auction/reports",
    label: "Report Reconciliations",
    roles: ["owner", "manager", "accountant"],
    entitlement: "auction",
    group: "Sales Handling",
  },
  {
    key: "auction-registry",
    href: "/dashboard/auction/registry",
    label: "Brokers & marks",
    roles: ["owner", "manager", "accountant"],
    entitlement: "auction",
    group: "Sales Handling",
  },
  {
    key: "auction",
    href: "/dashboard/auction",
    label: "Dispatches Overview",
    roles: ["owner", "manager", "accountant"],
    entitlement: "auction",
    group: "Dispatch Handling",
  },
  {
    key: "auction-dispatch-detail",
    href: "/dashboard/auction",
    label: "Dispatch Detail",
    roles: ["owner", "manager", "accountant"],
    entitlement: "auction",
    group: "Dispatch Handling",
  },
];

export function getDefaultRoles(moduleKey: string): readonly Role[] {
  return MODULES.find((m) => m.key === moduleKey)?.roles ?? MANAGEMENT_ROLES;
}

export function modulesForRole(role: Role): readonly ModuleDef[] {
  return MODULES.filter((m) => m.roles.includes(role));
}

/** Where a role lands when it hits a page it isn't allowed to see. */
export function roleHome(role: Role): string {
  return role === "collector" ? "/dashboard/weighings" : "/dashboard";
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  accountant: "Accountant",
  collector: "Collector",
  supplier: "Supplier",
  driver: "Driver",
};
