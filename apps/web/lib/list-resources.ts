/**
 * Client-safe identities and serializable row contracts for framework lists.
 *
 * A resource key is intentionally not a table name. It names a server-owned,
 * allowlisted read model. Parameters may only identify the parent/context of
 * that read model; tenant and actor identifiers are always resolved server-side.
 */

export type AuctionBrokerListRow = {
  id: string;
  name: string;
  vat_no: string | null;
  address: string | null;
};

export type AuctionMarkListRow = {
  id: string;
  code: string;
  name: string;
  address: string | null;
};

export type AuctionBrokerRateListRow = {
  id: string;
  brokerId: string;
  broker: string;
  effectiveFrom: string;
  brokeragePct: number;
  insurancePerKg: number;
  handlingPerKg: number;
  eplatformPerKg: number;
  publicSaleExPerLot: number;
  documentationPerLot: number;
  govtReliefLoan: number;
  chargesVatPct: number;
  proceedsVatPct: number;
};

export type AuctionGradeListRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sortOrder: number;
  sampleWeight: number | null;
  defaultKgPerBag: number | null;
  aliases: string[];
};

export type AuctionInvoicePrefixListRow = {
  id: string;
  category: string;
  prefix: string;
  active: boolean;
  createdAt: string | null;
};

export type AuctionPrefixExceptionListRow = {
  id: string;
  category: string;
  requestedPrefix: string;
  contextId: string | null;
  status: string;
  requestedByName: string | null;
  requestedAt: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdRecordId: string | null;
  note: string | null;
  payload: Record<string, unknown>;
};

export type AuctionWarehouseListRow = {
  id: string;
  name: string;
  active: boolean;
};

export type AuctionThresholdListRow = {
  key: string;
  brokerId: string;
  brokerName: string;
  gradeId: string;
  gradeCode: string;
  minNetKg: number;
  applies: boolean;
};

export type AuctionSaleLineListRow = {
  id: string;
  saleId: string;
  dispatchId: string | null;
  dispatchSaleNo: string | null;
  broker: string | null;
  mark: string | null;
  lotNo: string | null;
  invoiceNo: string;
  grade: string | null;
  state: string | null;
  stateLabel: string;
  stateStyle: string;
  shutout: boolean;
  shutoutReason: string | null;
  unsold: boolean;
  buyerName: string | null;
  buyerVatNo: string | null;
  bags: number | null;
  kgPerBag: number | null;
  sampleKg: number | null;
  netWt: number;
  pricePerKg: number | null;
  proceeds: number | null;
  vatAmount: number | null;
  onGuarantee: boolean | null;
  reprint: boolean;
  reprintRegistered: boolean;
  /**
   * Guarantee is tri-state (Guarantee / Cash / Not sold), so it carries its own
   * label; plain booleans do not — the framework matches those on the boolean.
   */
  guaranteeLabel: string;
  reprintCount: number;
  previousSaleNo: string | null;
  /** The broker catalogued this lot in a later sale than the one it sits in. */
  skippedSale: boolean;
  /** On the origin row only: the sale it was actually acknowledged in. */
  skippedSaleNo: string | null;
  /** Left this sale for a later one — excluded from every figure in the header. */
  skippedAway: boolean;
};

export type AuctionDispatchListRow = {
  id: string;
  sale_no: string;
  target_sale_no: string;
  dispatch_date: string | null;
  sale_date: string | null;
  prompt_date: string | null;
  selling_mark: string | null;
  broker_lorry_no: string | null;
  driver_name: string | null;
  transporter: string | null;
  bundle_dispatch_no: string | null;
  /** `invoice` | `reprint-register` — which screen opened this Dispatch Invoice. */
  entry_source: string | null;
  created_date: string | null;
  status: string;
  brokers: { name: string } | null;
};

/** The physical outbound movement that groups two or more Dispatch Invoices. */
export type AuctionPhysicalDispatchListRow = {
  id: string;
  dispatchNo: string;
  dispatchDateFrom: string;
  dispatchDateTo: string;
  warehouse: string;
  invoiceCount: number;
  status: string;
  /** Server-side creation date in the factory's Asia/Colombo calendar. */
  createdDate: string | null;
};

/** The Auction Sale side rail — a virtual grouping over auction_sales by target sale no. */
export type AuctionSalesSideListRow = {
  saleNo: string;
  dispatchNos: string[];
  brokers: string[];
  saleDate: string | null;
  statuses: string[];
  reprintRegister: boolean;
};

/** Every staged/confirmed auction document, factory-wide — the Document Details side rail. */
export type AuctionDocumentSideListRow = {
  id: string;
  docType: "grn" | "acknowledgement" | "valuation" | "contract" | "bank_csv";
  docTypeLabel: string;
  filename: string;
  broker: string;
  saleNo: string;
  status: "valid" | "warning" | "issue";
  statusLabel: string;
  active: boolean;
  uploadedAt: string | null;
};

/** Dispatch Invoices that may still be assigned to a physical dispatch. */
export type AuctionEligibleBrokerInvoiceListRow = {
  id: string;
  invoiceNo: string;
  broker: string;
  invoiceDate: string;
  lotCount: number;
  status: string;
};

export type AuctionDispatchLotListRow = {
  id: string;
  invoice_no: string | null;
  provisional_sale_no: string | null;
  final_sale_no: string | null;
  lot_no: string | null;
  grade: string | null;
  bags: number | null;
  kg_per_bag: number | null;
  sample_allowance: string | number | null;
  net_wt: string | number | null;
  mf_date: string | null;
  bag_type: string | null;
  chest_type: string | null;
  chest_numbers: string | null;
  moisture_level: string | number | null;
  state: string | null;
  shutout: boolean;
  shutout_reason: string | null;
  unsold: boolean;
  reprint: boolean;
  withdrawn: boolean;
  not_valued: boolean;
  missing: boolean;
  settled: boolean;
  lot_source: string | null;
  reprint_target_sale_id: string | null;
  reprint_target_label: string | null;
  threshold_min_net_kg: number | null;
  threshold_applies: boolean;
  marks: { code: string; name: string } | null;
  lot_invoices: { invoice_no: string }[] | null;
};

/**
 * One lot invoice ("basic invoice") across every dispatch invoice in the
 * factory, carrying the parent dispatch invoice's own attributes so the overview
 * can be read and filtered without opening each dispatch invoice in turn.
 * `biStatus` is the raw broker-invoice status — the page gates editing and
 * deleting on it, so it must not be a display label.
 */
export type AuctionInvoiceOverviewListRow = {
  id: string;
  saleId: string;
  invoiceNo: string;
  lotNo: string | null;
  grade: string | null;
  bags: number | null;
  kgPerBag: number | null;
  sampleKg: number | null;
  netWt: number | null;
  state: string | null;
  shutout: boolean;
  shutoutReason: string | null;
  unsold: boolean;
  reprint: boolean;
  mark: string | null;
  brokerInvoiceNo: string;
  saleNo: string | null;
  broker: string;
  sellingMark: string;
  /** Gross weight: the stored gross_wt when set, else bags x kg/bag. */
  allWeight: number | null;
  /** Sale the lot rolls into once re-printed, from its forward re-print link. */
  nextSaleNo: string | null;
  /** Sale this lot was carried forward from, from its own re-print link. */
  previousSaleNo: string | null;
  dispatchDate: string | null;
  saleDate: string | null;
  biStatus: string;
  /** The invoice's latest sale. Other rows for it are earlier-sale history. */
  activeInvoice: boolean;
};

export type AuctionReprintOverviewListRow = {
  id: string;
  dispatchId: string;
  dispatchNo: string | null;
  saleNo: string | null;
  broker: string;
  dispatchDate: string | null;
  saleDate: string | null;
  invoiceNo: string;
  lotNo: string | null;
  grade: string | null;
  bags: number | null;
  kgPerBag: number | null;
  totalSampleKg: number;
  remainingNetKg: number;
  actualSoldKg: number | null;
  reprintSales: string;
  soldSale: string | null;
  history: string;
  source: string | null;
  /**
   * `auction_sales.entry_source` of the chain ROOT: `reprint-register` means
   * the chain began as a re-print already outstanding at cutover rather than
   * as a lot this system dispatched.
   */
  entrySource: string | null;
  stateLabel: string;
  stateStyle: string;
  reprintCount: number;
};

/** One background job run, for the BLM Cloud overview. */
export type BackgroundJobListRow = {
  id: string;
  jobKey: string;
  jobTitle: string;
  label: string | null;
  /**
   * The stored status, before it is turned into something to read. The commands
   * decide on this rather than on the label — `cancelled` and a dead worker
   * both render as Interrupted, and only one of them is restartable in place.
   */
  state: "queued" | "running" | "completed" | "failed" | "cancelled";
  /** `Waiting to start` | `In progress` | `Completed` | `Error` | `Interrupted`. */
  stateLabel: string;
  stateStyle: string;
  progressLabel: string;
  percent: number;
  totalUnits: number;
  processedUnits: number;
  startedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationLabel: string;
  summary: string;
  error: string | null;
};

export type SupplierListRow = {
  id: string;
  name: string;
  area: string | null;
  phone: string | null;
  nicNumber: string | null;
  collectorId: string | null;
  collectorName: string;
  landSizeAcres: number | string | null;
  active: boolean;
};

export type CollectorListRow = {
  id: string;
  name: string;
  area: string | null;
  phone: string | null;
  nicNumber: string | null;
  active: boolean;
};

export type SentMessageListRow = {
  id: string;
  title: string;
  body: string;
  supplierId: string | null;
  recipient: string;
  sentAt: string;
};

export type SupplierRequestListRow = {
  id: string;
  supplierId: string;
  supplierName: string;
  typeKey: string;
  typeLabel: string;
  amount: string | null;
  status: string;
  note: string | null;
  requestedAt: string;
  handedAt: string | null;
};

export type PaymentAdjustmentListRow = {
  id: string;
  occurredOn: string;
  supplierName: string;
  kind: string;
  label: string | null;
  amount: string | null;
  percent: string | null;
};

export type SupplierTierAssignmentListRow = {
  id: string;
  supplierName: string;
  area: string | null;
  tierName: string | null;
  effectiveFrom: string | null;
  source: string | null;
};

export type QualityTierListRow = {
  id: string;
  name: string;
  bonusKind: string;
  bonusValue: string;
  sortOrder: number;
  active: boolean;
};

export type BaseRateListRow = {
  id: string;
  pricePerKg: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type PaymentStatementListRow = {
  id: string;
  supplierName: string;
  totalKg: number;
  grossAmount: number;
  deductionAmount: number;
  totalAmount: number;
  status: string;
};

export type UserAccountListRow = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  accessRoleId: string | null;
  baseRole: string;
  active: boolean;
};

export type AccessRoleListRow = {
  id: string;
  key: string;
  name: string;
  baseRole: string;
  systemRole: boolean;
  active: boolean;
};

export type RolePagePermissionListRow = {
  key: string;
  label: string;
  href: string;
  group: string;
  allowedActions: ("view" | "create" | "update" | "delete")[];
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

export type StaffDirectoryListRow = {
  id: string;
  fullName: string;
  role: string;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  employmentType: string | null;
};

export type WeighingListRow = {
  id: string;
  collectedAt: string;
  supplierName: string;
  collectorName: string;
  weightKg: number;
  notes: string | null;
};

/**
 * One synthetic row carrying a list instance's restorable search state: the
 * caller's own saved criteria plus any role lock that applies to them. Every
 * list — live (registry-backed) or local (side panels with server-rendered
 * initialRows) — fetches this by its own `scope` string to restore search on
 * mount, with zero per-list declaration.
 */
export type ListSearchStateRow = {
  saved: Record<string, string> | null;
  savedAdvancedQuery: string | null;
  locked: Record<string, string>;
  lockedAdvancedQuery: string | null;
  canManageLocks: boolean;
};

export type ListResourceContracts = {
  "auction.brokers": { params: undefined; row: AuctionBrokerListRow };
  "auction.marks": { params: undefined; row: AuctionMarkListRow };
  "auction.broker-rates": { params: undefined; row: AuctionBrokerRateListRow };
  "auction.grades": { params: undefined; row: AuctionGradeListRow };
  "auction.invoice-prefixes": { params: undefined; row: AuctionInvoicePrefixListRow };
  "auction.prefix-approvals": { params: undefined; row: AuctionPrefixExceptionListRow };
  "auction.warehouses": { params: undefined; row: AuctionWarehouseListRow };
  "auction.broker-grade-thresholds": { params: undefined; row: AuctionThresholdListRow };
  "auction.sale-lines": { params: { saleId: string }; row: AuctionSaleLineListRow };
  "auction.dispatches": { params: undefined; row: AuctionDispatchListRow };
  "auction.dispatch-lots": { params: { saleId: string }; row: AuctionDispatchLotListRow };
  "auction.reprint-overview": { params: undefined; row: AuctionReprintOverviewListRow };
  "auction.invoice-overview": { params: { dispatchId: string } | undefined; row: AuctionInvoiceOverviewListRow };
  "auction.physical-dispatches": { params: undefined; row: AuctionPhysicalDispatchListRow };
  "auction.sales-side-list": { params: undefined; row: AuctionSalesSideListRow };
  "auction.documents-side-list": { params: undefined; row: AuctionDocumentSideListRow };
  "auction.eligible-broker-invoices": { params: undefined; row: AuctionEligibleBrokerInvoiceListRow };
  "framework.background-jobs": { params: undefined; row: BackgroundJobListRow };
  "leaf.suppliers": { params: undefined; row: SupplierListRow };
  "leaf.collectors": { params: undefined; row: CollectorListRow };
  "communications.sent-messages": { params: undefined; row: SentMessageListRow };
  "communications.supplier-requests": { params: undefined; row: SupplierRequestListRow };
  "payments.adjustments": { params: undefined; row: PaymentAdjustmentListRow };
  "payments.tier-assignments": { params: undefined; row: SupplierTierAssignmentListRow };
  "payments.quality-tiers": { params: undefined; row: QualityTierListRow };
  "payments.base-rates": { params: undefined; row: BaseRateListRow };
  "payments.statements": { params: { year: number; month: number }; row: PaymentStatementListRow };
  "users.accounts": { params: undefined; row: UserAccountListRow };
  "users.roles": { params: undefined; row: AccessRoleListRow };
  "users.role-page-permissions": { params: { roleId: string }; row: RolePagePermissionListRow };
  "users.staff-directory": { params: undefined; row: StaffDirectoryListRow };
  "leaf.weighings": {
    params: { from?: string; to?: string; supplierId?: string; collectorId?: string };
    row: WeighingListRow;
  };
  "framework.search-state": { params: { listScope: string }; row: ListSearchStateRow };
};

export const LIST_RESOURCE_KEYS = [
  "auction.brokers",
  "auction.marks",
  "auction.broker-rates",
  "auction.grades",
  "auction.invoice-prefixes",
  "auction.prefix-approvals",
  "auction.warehouses",
  "auction.broker-grade-thresholds",
  "auction.sale-lines",
  "auction.dispatches",
  "auction.dispatch-lots",
  "auction.reprint-overview",
  "auction.invoice-overview",
  "auction.physical-dispatches",
  "auction.sales-side-list",
  "auction.documents-side-list",
  "auction.eligible-broker-invoices",
  "leaf.suppliers",
  "leaf.collectors",
  "communications.sent-messages",
  "communications.supplier-requests",
  "payments.adjustments",
  "payments.tier-assignments",
  "payments.quality-tiers",
  "payments.base-rates",
  "payments.statements",
  "users.accounts",
  "users.roles",
  "users.role-page-permissions",
  "users.staff-directory",
  "leaf.weighings",
  "framework.search-state",
  "framework.background-jobs",
] as const satisfies readonly (keyof ListResourceContracts)[];

/**
 * Exhaustiveness guard. The `satisfies` above only proves every key listed is
 * real — not that every real key is listed. A resource added to
 * ListResourceContracts but forgotten here typechecks cleanly and then fails
 * at runtime with "Unknown list resource.", because LIST_RESOURCE_KEYS is the
 * allowlist isListResourceKey enforces. This turns that omission into a type
 * error naming the missing key.
 */
const _everyResourceKeyIsRegistered: never[] =
  [] as Exclude<keyof ListResourceContracts, (typeof LIST_RESOURCE_KEYS)[number]>[];
void _everyResourceKeyIsRegistered;

export type ListResourceKey = keyof ListResourceContracts;
export type ListResourceParams<Key extends ListResourceKey> = ListResourceContracts[Key]["params"];
export type ListResourceRow<Key extends ListResourceKey> = ListResourceContracts[Key]["row"];

export type ListResourceRequest<Key extends ListResourceKey = ListResourceKey> =
  Key extends ListResourceKey
    ? ListResourceParams<Key> extends undefined
      ? { key: Key; params?: never }
      // `X | undefined` — a list that is factory-wide unscoped and narrowed
      // when params are given, so both call shapes have to typecheck.
      : undefined extends ListResourceParams<Key>
        ? { key: Key; params?: ListResourceParams<Key> }
        : { key: Key; params: ListResourceParams<Key> }
    : never;

/**
 * Optional search/pagination state layered on top of a resource request. Omit
 * entirely for the initial server-rendered load (which restores the caller's
 * saved+locked criteria automatically); pass it on later refreshes triggered
 * by "Search" or "Show more".
 */
export type ListResourceSearch = {
  criteria?: Record<string, string>;
  advancedQuery?: string | null;
  offset?: number;
  limit?: number;
};

export type ListInvalidation =
  | { kind: "exact"; resource: ListResourceRequest }
  | { kind: "all"; key: ListResourceKey };

export function isListResourceKey(value: unknown): value is ListResourceKey {
  return typeof value === "string" && (LIST_RESOURCE_KEYS as readonly string[]).includes(value);
}

export function listResourceIdentity(resource: ListResourceRequest): string {
  if (!("params" in resource) || !resource.params) return resource.key;
  const params = Object.entries(resource.params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return `${resource.key}?${params}`;
}
