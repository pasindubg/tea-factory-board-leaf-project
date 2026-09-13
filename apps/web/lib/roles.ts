// The application's database RLS policies deliberately use these stable base
// roles. Factory-defined roles sit on top of one of them and can only narrow
// access through page permissions; they never bypass the RLS baseline.
export type Role =
  | "owner"
  | "manager"
  | "supervisor"
  | "accountant"
  | "collector"
  | "supplier"
  | "driver"
  | "field_officer";

export const ALL_WEB_ROLES: readonly Role[] = ["owner", "manager", "supervisor", "accountant", "collector"];
export const MANAGEMENT_ROLES: readonly Role[] = ["owner", "manager"];
// `field_officer` is mobile-only: it has no PAGE_DEFINITIONS entry, so a role
// built on it reaches no web page. It is listed here so owners can create the
// login at all.
export const CUSTOMIZABLE_BASE_ROLES: readonly Role[] = ["manager", "supervisor", "accountant", "collector", "field_officer"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  accountant: "Accountant",
  collector: "Collector",
  supplier: "Supplier",
  driver: "Driver",
  field_officer: "Field officer",
};

export type Entitlement = "leaf-handling" | "auction" | "production" | "accounts";

export type ModuleGroup = "Leaf Handling" | "Sales Handling" | "Dispatch Handling" | "Index Cycle Management" | "User Handling" | "BLM Cloud";
// BLM Cloud sits last: it is platform-level operations (background jobs and,
// later, other cloud tooling) rather than a step in the factory's work.
export const MODULE_GROUP_ORDER: readonly ModuleGroup[] = ["Leaf Handling", "Sales Handling", "Dispatch Handling", "Index Cycle Management", "User Handling", "BLM Cloud"];

export type ModuleDef = {
  key: string;
  href: string;
  label: string;
  roles: readonly Role[];
  entitlement: Entitlement;
  group?: ModuleGroup;
  subGroup?: string;
  visibleInNavigation?: boolean;
};

// These are the sidebar destinations. Detailed routes are registered below in
// PAGE_DEFINITIONS, which is the source of truth for custom-role permissions.
export const MODULES: readonly ModuleDef[] = [
  { key: "overview", href: "/dashboard", label: "Overview", roles: ["owner", "manager", "supervisor", "accountant"], entitlement: "leaf-handling" },
  { key: "weighings", href: "/dashboard/weighings", label: "Weighings", roles: ALL_WEB_ROLES, entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "suppliers", href: "/dashboard/suppliers", label: "Customers", roles: ["owner", "manager", "supervisor", "accountant"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "collectors", href: "/dashboard/collectors", label: "Collectors", roles: ["owner", "manager", "supervisor"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "lines", href: "/dashboard/lines", label: "Lines", roles: ["owner", "manager", "supervisor"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "vehicles", href: "/dashboard/vehicles", label: "Vehicles", roles: ["owner", "manager", "supervisor"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "drivers", href: "/dashboard/drivers", label: "Drivers", roles: ["owner", "manager", "supervisor"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "requests", href: "/dashboard/requests", label: "Requests", roles: ["owner", "manager", "supervisor"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "messages", href: "/dashboard/messages", label: "Messages", roles: ["owner", "manager", "supervisor"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "payments", href: "/dashboard/payments", label: "Payments", roles: ["owner", "manager", "accountant"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "auction-dashboard", href: "/dashboard/auction/dashboard", label: "Dashboard", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-sales", href: "/dashboard/auction/sales", label: "Sales Overview", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-sale-detail", href: "/dashboard/auction/sales-details", label: "Sales Detail", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-documents", href: "/dashboard/auction/documents", label: "Document Details", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-registry", href: "/dashboard/auction/registry", label: "Brokers & marks", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-settings", href: "/dashboard/auction/settings", label: "Auction setup", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-reprints", href: "/dashboard/auction/reprints", label: "Re-print Overview", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-invoice-prefixes", href: "/dashboard/auction/invoice-prefixes", label: "Invoice number prefixes", roles: ["owner", "manager", "supervisor"], entitlement: "auction", group: "Index Cycle Management" },
  { key: "auction-prefix-approvals", href: "/dashboard/auction/prefix-approvals", label: "Prefix approvals", roles: ["owner", "manager", "supervisor"], entitlement: "auction", group: "Index Cycle Management" },
  { key: "auction-invoice-overview", href: "/dashboard/auction/invoices", label: "Invoice Overview", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Dispatch Handling" },
  { key: "auction-dispatch-detail", href: "/dashboard/auction/new", label: "Dispatch Invoice Details", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Dispatch Handling" },
  { key: "auction-bundled-dispatch-details", href: "/dashboard/auction/dispatches/details", label: "Dispatch Details", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Dispatch Handling" },
  { key: "auction-warehouses", href: "/dashboard/auction/warehouses", label: "Warehouse Basic Data", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Dispatch Handling" },
  { key: "background-jobs", href: "/dashboard/blm-cloud/background-jobs", label: "Background jobs", roles: ["owner", "manager"], entitlement: "leaf-handling", group: "BLM Cloud" },
  // Owner only: it deletes every auction transaction the factory has recorded.
  { key: "auction-data", href: "/dashboard/blm-cloud/auction-data", label: "Auction data reset & import", roles: ["owner"], entitlement: "auction", group: "BLM Cloud" },
  { key: "users", href: "/dashboard/user-handling/users", label: "Users", roles: ["owner"], entitlement: "leaf-handling", group: "User Handling" },
  { key: "roles", href: "/dashboard/user-handling/roles", label: "Roles & permissions", roles: ["owner"], entitlement: "leaf-handling", group: "User Handling" },
  { key: "user-devices", href: "/dashboard/user-handling/devices", label: "Bound devices", roles: ["owner", "manager"], entitlement: "leaf-handling", group: "User Handling" },
];

export type RolePageAction = "view" | "create" | "update" | "delete";
export const ROLE_PAGE_ACTIONS: readonly RolePageAction[] = ["view", "create", "update", "delete"];

export type PageDef = {
  key: string;
  label: string;
  href: string;
  group: ModuleGroup | "Personal";
  moduleKey: string;
  roles: readonly Role[];
};

const page = (key: string, label: string, href: string, group: PageDef["group"], moduleKey: string, roles: readonly Role[]): PageDef => ({
  key, label, href, group, moduleKey, roles,
});

// Every dashboard route is intentionally catalogued here. Dynamic details use
// their owning route pattern so roles can be configured without exposing IDs.
export const PAGE_DEFINITIONS: readonly PageDef[] = [
  page("overview", "Overview", "/dashboard", "Personal", "overview", ["owner", "manager", "supervisor", "accountant"]),
  page("personal-settings", "My settings", "/dashboard/settings", "Personal", "personal-settings", ALL_WEB_ROLES),
  page("background-jobs", "Background jobs", "/dashboard/blm-cloud/background-jobs", "BLM Cloud", "background-jobs", ["owner", "manager"]),
  page("auction-data", "Auction data reset & import", "/dashboard/blm-cloud/auction-data", "BLM Cloud", "auction-data", ["owner"]),
  // Go-live tooling: wipes auction transactions and loads the factory's
  // historic dispatch book. Owner only — it is destructive and one-off.
  page("weighings", "Weighings", "/dashboard/weighings", "Leaf Handling", "weighings", ALL_WEB_ROLES),
  page("weighings-new", "New weighing", "/dashboard/weighings/new", "Leaf Handling", "weighings", ALL_WEB_ROLES),
  page("suppliers", "Customers", "/dashboard/suppliers", "Leaf Handling", "suppliers", ["owner", "manager", "supervisor", "accountant"]),
  page("supplier-new", "New customer", "/dashboard/suppliers/new", "Leaf Handling", "suppliers", ["owner", "manager", "supervisor"]),
  page("supplier-edit", "Edit customer", "/dashboard/suppliers/[id]/edit", "Leaf Handling", "suppliers", ["owner", "manager", "supervisor"]),
  page("collectors", "Collectors", "/dashboard/collectors", "Leaf Handling", "collectors", ["owner", "manager", "supervisor"]),
  page("collector-new", "New collector", "/dashboard/collectors/new", "Leaf Handling", "collectors", ["owner", "manager", "supervisor"]),
  page("collector-edit", "Edit collector", "/dashboard/collectors/[id]/edit", "Leaf Handling", "collectors", ["owner", "manager", "supervisor"]),
  page("lines", "Lines", "/dashboard/lines", "Leaf Handling", "lines", ["owner", "manager", "supervisor"]),
  page("line-detail", "Line detail", "/dashboard/lines/[id]", "Leaf Handling", "lines", ["owner", "manager", "supervisor"]),
  page("vehicles", "Vehicles", "/dashboard/vehicles", "Leaf Handling", "vehicles", ["owner", "manager", "supervisor"]),
  page("drivers", "Drivers", "/dashboard/drivers", "Leaf Handling", "drivers", ["owner", "manager", "supervisor"]),
  page("requests", "Requests", "/dashboard/requests", "Leaf Handling", "requests", ["owner", "manager", "supervisor"]),
  page("messages", "Messages", "/dashboard/messages", "Leaf Handling", "messages", ["owner", "manager", "supervisor"]),
  page("payments", "Payments", "/dashboard/payments", "Leaf Handling", "payments", ["owner", "manager", "accountant"]),
  page("payment-statement", "Payment statement", "/dashboard/payments/[id]", "Leaf Handling", "payments", ["owner", "manager", "accountant"]),
  page("payment-adjustments", "Payment adjustments", "/dashboard/payments/adjustments", "Leaf Handling", "payments", ["owner", "manager", "accountant"]),
  page("payment-tiers", "Supplier tiers", "/dashboard/payments/tiers", "Leaf Handling", "payments", ["owner", "manager", "accountant"]),
  page("payment-settings", "Payment settings", "/dashboard/payments/settings", "Leaf Handling", "payments", ["owner", "manager", "accountant"]),
  page("auction-dashboard", "Auction dashboard", "/dashboard/auction/dashboard", "Sales Handling", "auction-dashboard", ["owner", "manager", "accountant"]),
  page("auction-sales", "Sales overview", "/dashboard/auction/sales", "Sales Handling", "auction-sales", ["owner", "manager", "accountant"]),
  page("auction-sale-detail", "Sales detail", "/dashboard/auction/sales/[saleNo]", "Sales Handling", "auction-sale-detail", ["owner", "manager", "accountant"]),
  page("auction-documents", "Document details", "/dashboard/auction/documents/[documentId]", "Sales Handling", "auction-documents", ["owner", "manager", "accountant"]),
  page("auction-registry", "Brokers & marks", "/dashboard/auction/registry", "Sales Handling", "auction-registry", ["owner", "manager", "accountant"]),
  page("auction-settings", "Auction setup", "/dashboard/auction/settings", "Sales Handling", "auction-settings", ["owner", "manager", "accountant"]),
  page("auction-reprints", "Re-print overview", "/dashboard/auction/reprints", "Sales Handling", "auction-reprints", ["owner", "manager", "accountant"]),
  page("auction-invoice-prefixes", "Invoice number prefixes", "/dashboard/auction/invoice-prefixes", "Index Cycle Management", "auction-invoice-prefixes", ["owner", "manager", "supervisor"]),
  page("auction-prefix-approvals", "Prefix approvals", "/dashboard/auction/prefix-approvals", "Index Cycle Management", "auction-prefix-approvals", ["owner", "manager", "supervisor"]),
  page("auction-invoice-new", "New dispatch invoice", "/dashboard/auction/new", "Dispatch Handling", "auction", ["owner", "manager", "accountant"]),
  page("auction-invoice-overview", "Invoice overview", "/dashboard/auction/invoices", "Dispatch Handling", "auction-invoice-overview", ["owner", "manager", "accountant"]),
  page("auction-invoice-detail", "Dispatch invoice details", "/dashboard/auction/[saleId]", "Dispatch Handling", "auction-dispatch-detail", ["owner", "manager", "accountant"]),
  page("auction-dispatch-details", "Dispatch details", "/dashboard/auction/dispatches/details", "Dispatch Handling", "auction-bundled-dispatch-details", ["owner", "manager", "accountant"]),
  page("auction-dispatch-detail-view", "Physical dispatch detail", "/dashboard/auction/dispatches/[dispatchId]", "Dispatch Handling", "auction-bundled-dispatch-details", ["owner", "manager", "accountant"]),
  page("auction-warehouses", "Warehouse basic data", "/dashboard/auction/warehouses", "Dispatch Handling", "auction-warehouses", ["owner", "manager", "accountant"]),
  page("user-handling-users", "Users", "/dashboard/user-handling/users", "User Handling", "users", ["owner"]),
  page("user-handling-roles", "Roles & permissions", "/dashboard/user-handling/roles", "User Handling", "roles", ["owner"]),
  page("user-devices", "Bound devices", "/dashboard/user-handling/devices", "User Handling", "user-devices", ["owner", "manager"]),
];

export function getDefaultRoles(moduleKey: string): readonly Role[] {
  return MODULES.find((module) => module.key === moduleKey)?.roles ?? MANAGEMENT_ROLES;
}

export function getPageDefinition(key: string): PageDef | undefined {
  return PAGE_DEFINITIONS.find((item) => item.key === key);
}

export function pagesForModule(moduleKey: string): readonly PageDef[] {
  return PAGE_DEFINITIONS.filter((item) => item.moduleKey === moduleKey);
}

/**
 * Whether a base role may be GRANTED a page action at all.
 *
 * Every registered page and action is grantable to every factory role: the
 * owner decides, through an explicit `role_page_permissions` row, and the
 * matrix would otherwise show dead cells for roles the old hardcoded ceiling
 * never anticipated (a `field_officer`'s whole matrix was disabled).
 *
 * This is a grant ceiling for the WEB UI only. `PAGE_DEFINITIONS.roles` still
 * drives the default access a role gets with no explicit row, and the database
 * remains the real authority — RLS factory isolation, `current_factory_id()`,
 * and the restrictive policies (device binding, supplier scoping) are unmoved
 * by anything ticked here.
 */
export function roleMayPerformPageAction(role: Role, pageDef: PageDef, action: RolePageAction): boolean {
  if (role === "owner") return true;
  return PAGE_DEFINITIONS.includes(pageDef) && ROLE_PAGE_ACTIONS.includes(action);
}

export function modulesForRole(role: Role): readonly ModuleDef[] {
  return MODULES.filter((module) => module.roles.includes(role));
}

export function roleHome(role: Role): string {
  return role === "collector" ? "/dashboard/weighings" : "/dashboard";
}
