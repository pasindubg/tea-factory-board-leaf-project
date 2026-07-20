// The application's database RLS policies deliberately use these stable base
// roles. Factory-defined roles sit on top of one of them and can only narrow
// access through page permissions; they never bypass the RLS baseline.
export type Role = "owner" | "manager" | "supervisor" | "accountant" | "collector" | "supplier" | "driver";

export const ALL_WEB_ROLES: readonly Role[] = ["owner", "manager", "supervisor", "accountant", "collector"];
export const MANAGEMENT_ROLES: readonly Role[] = ["owner", "manager"];
export const CUSTOMIZABLE_BASE_ROLES: readonly Role[] = ["manager", "supervisor", "accountant", "collector"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  accountant: "Accountant",
  collector: "Collector",
  supplier: "Supplier",
  driver: "Driver",
};

export type Entitlement = "leaf-handling" | "auction" | "production" | "accounts";

export type ModuleGroup = "Leaf Handling" | "Sales Handling" | "Dispatch Handling" | "User Handling";
export const MODULE_GROUP_ORDER: readonly ModuleGroup[] = ["Leaf Handling", "Sales Handling", "Dispatch Handling", "User Handling"];

export type ModuleDef = {
  key: string;
  href: string;
  label: string;
  roles: readonly Role[];
  entitlement: Entitlement;
  group?: ModuleGroup;
  subGroup?: string;
};

// These are the sidebar destinations. Detailed routes are registered below in
// PAGE_DEFINITIONS, which is the source of truth for custom-role permissions.
export const MODULES: readonly ModuleDef[] = [
  { key: "overview", href: "/dashboard", label: "Overview", roles: ["owner", "manager", "supervisor", "accountant"], entitlement: "leaf-handling" },
  { key: "weighings", href: "/dashboard/weighings", label: "Weighings", roles: ALL_WEB_ROLES, entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "suppliers", href: "/dashboard/suppliers", label: "Suppliers", roles: ["owner", "manager", "supervisor", "accountant"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "collectors", href: "/dashboard/collectors", label: "Collectors", roles: ["owner", "manager", "supervisor"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "requests", href: "/dashboard/requests", label: "Requests", roles: ["owner", "manager", "supervisor"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "messages", href: "/dashboard/messages", label: "Messages", roles: ["owner", "manager", "supervisor"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "payments", href: "/dashboard/payments", label: "Payments", roles: ["owner", "manager", "accountant"], entitlement: "leaf-handling", group: "Leaf Handling" },
  { key: "auction-dashboard", href: "/dashboard/auction/dashboard", label: "Dashboard", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-sales", href: "/dashboard/auction/sales", label: "Sales Overview", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-sale-detail", href: "/dashboard/auction/sales", label: "Sales Detail", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-reports", href: "/dashboard/auction/reports", label: "Report Reconciliations", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-registry", href: "/dashboard/auction/registry", label: "Brokers & marks", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction-settings", href: "/dashboard/auction/settings", label: "Auction setup", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Sales Handling" },
  { key: "auction", href: "/dashboard/auction", label: "Invoice Overview", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Dispatch Handling" },
  { key: "auction-dispatch-detail", href: "/dashboard/auction", label: "Invoice Details", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Dispatch Handling" },
  { key: "auction-dispatch-overview", href: "/dashboard/auction/dispatches", label: "Dispatch Overview", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Dispatch Handling" },
  { key: "auction-bundled-dispatch-details", href: "/dashboard/auction/dispatches/details", label: "Dispatch Details", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Dispatch Handling" },
  { key: "auction-warehouses", href: "/dashboard/auction/warehouses", label: "Warehouse Basic Data", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Dispatch Handling" },
  { key: "auction-reprints", href: "/dashboard/auction/reprints", label: "Re-print Overview", roles: ["owner", "manager", "accountant"], entitlement: "auction", group: "Dispatch Handling" },
  { key: "users", href: "/dashboard/user-handling/users", label: "Users", roles: ["owner"], entitlement: "leaf-handling", group: "User Handling" },
  { key: "roles", href: "/dashboard/user-handling/roles", label: "Roles & permissions", roles: ["owner"], entitlement: "leaf-handling", group: "User Handling" },
];

export type RolePageAction = "view" | "create" | "update" | "delete";

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
  page("weighings", "Weighings", "/dashboard/weighings", "Leaf Handling", "weighings", ALL_WEB_ROLES),
  page("weighings-new", "New weighing", "/dashboard/weighings/new", "Leaf Handling", "weighings", ALL_WEB_ROLES),
  page("suppliers", "Suppliers", "/dashboard/suppliers", "Leaf Handling", "suppliers", ["owner", "manager", "supervisor", "accountant"]),
  page("supplier-new", "New supplier", "/dashboard/suppliers/new", "Leaf Handling", "suppliers", ["owner", "manager", "supervisor"]),
  page("supplier-edit", "Edit supplier", "/dashboard/suppliers/[id]/edit", "Leaf Handling", "suppliers", ["owner", "manager", "supervisor"]),
  page("collectors", "Collectors", "/dashboard/collectors", "Leaf Handling", "collectors", ["owner", "manager", "supervisor"]),
  page("collector-new", "New collector", "/dashboard/collectors/new", "Leaf Handling", "collectors", ["owner", "manager", "supervisor"]),
  page("collector-edit", "Edit collector", "/dashboard/collectors/[id]/edit", "Leaf Handling", "collectors", ["owner", "manager", "supervisor"]),
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
  page("auction-reports", "Report reconciliations", "/dashboard/auction/reports", "Sales Handling", "auction-reports", ["owner", "manager", "accountant"]),
  page("auction-registry", "Brokers & marks", "/dashboard/auction/registry", "Sales Handling", "auction-registry", ["owner", "manager", "accountant"]),
  page("auction-settings", "Auction setup", "/dashboard/auction/settings", "Sales Handling", "auction-settings", ["owner", "manager", "accountant"]),
  page("auction-invoices", "Invoice overview", "/dashboard/auction", "Dispatch Handling", "auction", ["owner", "manager", "accountant"]),
  page("auction-invoice-new", "New broker invoice", "/dashboard/auction/new", "Dispatch Handling", "auction", ["owner", "manager", "accountant"]),
  page("auction-invoice-detail", "Invoice details", "/dashboard/auction/[saleId]", "Dispatch Handling", "auction-dispatch-detail", ["owner", "manager", "accountant"]),
  page("auction-acknowledgement", "Invoice acknowledgement", "/dashboard/auction/[saleId]/ack/[importId]", "Dispatch Handling", "auction-dispatch-detail", ["owner", "manager", "accountant"]),
  page("auction-valuation", "Invoice valuation", "/dashboard/auction/[saleId]/valuation/[importId]", "Dispatch Handling", "auction-dispatch-detail", ["owner", "manager", "accountant"]),
  page("auction-contract", "Seller contract", "/dashboard/auction/[saleId]/contract/[importId]", "Dispatch Handling", "auction-dispatch-detail", ["owner", "manager", "accountant"]),
  page("auction-bank", "Bank reconciliation", "/dashboard/auction/[saleId]/bank/[importId]", "Dispatch Handling", "auction-dispatch-detail", ["owner", "manager", "accountant"]),
  page("auction-dispatches", "Dispatch overview", "/dashboard/auction/dispatches", "Dispatch Handling", "auction-dispatch-overview", ["owner", "manager", "accountant"]),
  page("auction-dispatch-new", "New physical dispatch", "/dashboard/auction/dispatches/new", "Dispatch Handling", "auction-dispatch-overview", ["owner", "manager", "accountant"]),
  page("auction-dispatch-details", "Dispatch details", "/dashboard/auction/dispatches/details", "Dispatch Handling", "auction-bundled-dispatch-details", ["owner", "manager", "accountant"]),
  page("auction-dispatch-detail-view", "Physical dispatch detail", "/dashboard/auction/dispatches/[dispatchId]", "Dispatch Handling", "auction-bundled-dispatch-details", ["owner", "manager", "accountant"]),
  page("auction-warehouses", "Warehouse basic data", "/dashboard/auction/warehouses", "Dispatch Handling", "auction-warehouses", ["owner", "manager", "accountant"]),
  page("auction-reprints", "Re-print overview", "/dashboard/auction/reprints", "Dispatch Handling", "auction-reprints", ["owner", "manager", "accountant"]),
  page("user-handling-users", "Users", "/dashboard/user-handling/users", "User Handling", "users", ["owner"]),
  page("user-handling-roles", "Roles & permissions", "/dashboard/user-handling/roles", "User Handling", "roles", ["owner"]),
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

/** The upper action boundary enforced for a base RLS role. */
export function roleMayPerformPageAction(role: Role, pageDef: PageDef, action: RolePageAction): boolean {
  if (role === "owner") return true;
  if (!pageDef.roles.includes(role)) return false;
  if (action === "view") return true;
  if (role === "manager") return true;

  const operational = new Set(["weighings", "suppliers", "collectors", "requests", "messages"]);
  if (role === "supervisor") return action !== "delete" && operational.has(pageDef.moduleKey);
  if (role === "accountant") return action !== "delete" && (pageDef.moduleKey === "payments" || pageDef.moduleKey.startsWith("auction"));
  if (role === "collector") return action !== "delete" && pageDef.moduleKey === "weighings";
  return false;
}

export function modulesForRole(role: Role): readonly ModuleDef[] {
  return MODULES.filter((module) => module.roles.includes(role));
}

export function roleHome(role: Role): string {
  return role === "collector" ? "/dashboard/weighings" : "/dashboard";
}
