import type { ListResourceKey } from "@/lib/list-resources";

/**
 * Product language for the common list shell. The key is an opaque read-model
 * identity, never a client-supplied database table name.
 */
export const ENTITY_LIST_METADATA: Record<ListResourceKey, { title: string; description: string }> = {
  "auction.brokers": { title: "Brokers", description: "Broker contacts available to this factory." },
  "auction.marks": { title: "Selling marks", description: "Factory selling marks used on broker invoices." },
  "auction.broker-rates": { title: "Broker rate cards", description: "Effective-dated deductions used for settlement calculations." },
  "auction.grades": { title: "Tea grades", description: "Canonical grade names and acknowledgement aliases." },
  "auction.warehouses": { title: "Warehouses", description: "Physical locations used when grouping broker invoices for dispatch." },
  "auction.broker-grade-thresholds": { title: "Broker grade thresholds", description: "Minimum net weights that apply to each broker and grade." },
  "auction.sale-lines": { title: "Sale lines", description: "Lots and realised sale values for this auction sale." },
  "auction.dispatches": { title: "Broker invoices", description: "Broker invoice dispatches for this factory." },
  "auction.dispatch-lots": { title: "Invoice lots", description: "Lots attached to this broker invoice." },
  "auction.reprint-overview": { title: "Re-print overview", description: "Historic and current lots that have been re-printed." },
  "auction.physical-dispatches": { title: "Physical dispatches", description: "Outbound warehouse movements that group broker invoices." },
  "auction.eligible-broker-invoices": { title: "Eligible broker invoices", description: "Invoices that can still be assigned to a physical dispatch." },
  "leaf.suppliers": { title: "Suppliers", description: "Leaf suppliers registered to this factory." },
  "leaf.collectors": { title: "Collectors", description: "Collection staff registered to this factory." },
  "communications.sent-messages": { title: "Messages", description: "Messages sent to suppliers." },
  "communications.supplier-requests": { title: "Supplier requests", description: "Supplier requests raised through the field app." },
  "payments.adjustments": { title: "Advances and adjustments", description: "Effective-dated additions and deductions applied when statements are regenerated." },
  "payments.tier-assignments": { title: "Supplier tier assignments", description: "Current quality tiers applied to suppliers." },
  "payments.quality-tiers": { title: "Quality tiers", description: "Quality bonuses and ranking used by payments." },
  "payments.base-rates": { title: "Base rates", description: "Effective-dated green-leaf rates." },
  "payments.statements": { title: "Payment statements", description: "Supplier payment statements for the selected period." },
  "users.accounts": { title: "Users", description: "Logins for this factory." },
  "users.module-permissions": { title: "Module permissions", description: "Per-factory role access overrides." },
  "leaf.weighings": { title: "Weighings", description: "Leaf intake records for the selected period and filters." },
};
