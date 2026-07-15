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
  aliases: string[];
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
  lotNo: string | null;
  invoiceNo: string;
  grade: string | null;
  state: string | null;
  stateLabel: string;
  stateStyle: string;
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
  reprintCount: number;
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
  bundle_dispatch_no: string | null;
  created_date: string | null;
  status: string;
  brokers: { name: string } | null;
};

/** The physical outbound movement that groups two or more Broker Invoices. */
export type AuctionPhysicalDispatchListRow = {
  id: string;
  dispatchNo: string;
  dispatchDateFrom: string;
  dispatchDateTo: string;
  warehouse: string;
  invoiceCount: number;
  status: string;
};

/** Broker Invoices that may still be assigned to a physical dispatch. */
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
  state: string | null;
  shutout_reason: string | null;
  lot_source: string | null;
  reprint_target_sale_id: string | null;
  reprint_target_label: string | null;
  threshold_min_net_kg: number | null;
  threshold_applies: boolean;
  marks: { code: string; name: string } | null;
  lot_invoices: { invoice_no: string }[] | null;
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
  active: boolean;
};

export type ModulePermissionListRow = {
  key: string;
  label: string;
  configurableRoles: string[];
  allowedRoles: string[];
};

export type WeighingListRow = {
  id: string;
  collectedAt: string;
  supplierName: string;
  collectorName: string;
  weightKg: number;
  notes: string | null;
};

export type ListResourceContracts = {
  "auction.brokers": { params: undefined; row: AuctionBrokerListRow };
  "auction.marks": { params: undefined; row: AuctionMarkListRow };
  "auction.broker-rates": { params: undefined; row: AuctionBrokerRateListRow };
  "auction.grades": { params: undefined; row: AuctionGradeListRow };
  "auction.warehouses": { params: undefined; row: AuctionWarehouseListRow };
  "auction.broker-grade-thresholds": { params: undefined; row: AuctionThresholdListRow };
  "auction.sale-lines": { params: { saleId: string }; row: AuctionSaleLineListRow };
  "auction.dispatches": { params: undefined; row: AuctionDispatchListRow };
  "auction.dispatch-lots": { params: { saleId: string }; row: AuctionDispatchLotListRow };
  "auction.physical-dispatches": { params: undefined; row: AuctionPhysicalDispatchListRow };
  "auction.eligible-broker-invoices": { params: undefined; row: AuctionEligibleBrokerInvoiceListRow };
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
  "users.module-permissions": { params: undefined; row: ModulePermissionListRow };
  "leaf.weighings": {
    params: { from?: string; to?: string; supplierId?: string; collectorId?: string };
    row: WeighingListRow;
  };
};

export const LIST_RESOURCE_KEYS = [
  "auction.brokers",
  "auction.marks",
  "auction.broker-rates",
  "auction.grades",
  "auction.warehouses",
  "auction.broker-grade-thresholds",
  "auction.sale-lines",
  "auction.dispatches",
  "auction.dispatch-lots",
  "auction.physical-dispatches",
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
  "users.module-permissions",
  "leaf.weighings",
] as const satisfies readonly (keyof ListResourceContracts)[];

export type ListResourceKey = keyof ListResourceContracts;
export type ListResourceParams<Key extends ListResourceKey> = ListResourceContracts[Key]["params"];
export type ListResourceRow<Key extends ListResourceKey> = ListResourceContracts[Key]["row"];

export type ListResourceRequest<Key extends ListResourceKey = ListResourceKey> =
  Key extends ListResourceKey
    ? ListResourceParams<Key> extends undefined
      ? { key: Key; params?: never }
      : { key: Key; params: ListResourceParams<Key> }
    : never;

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
