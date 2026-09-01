import type { ListResourceKey } from "@/lib/list-resources";

/**
 * Product language for the common list shell. The key is an opaque read-model
 * identity, never a client-supplied database table name.
 */
export const ENTITY_LIST_METADATA: Record<ListResourceKey, { title: string; description: string }> = {
  "framework.search-state": { title: "Search state", description: "Internal: a list instance's saved and locked search criteria." },
  "framework.background-jobs": { title: "Background jobs", description: "Every long-running job this factory has started, with its progress and outcome." },
  "auction.brokers": { title: "Brokers", description: "Broker contacts available to this factory." },
  "auction.marks": { title: "Selling marks", description: "Factory selling marks used on dispatch invoices." },
  "auction.broker-rates": { title: "Broker rate cards", description: "Effective-dated deductions used for settlement calculations." },
  "auction.grades": { title: "Tea grades", description: "Canonical grade names and acknowledgement aliases." },
  "auction.invoice-prefixes": { title: "Invoice number prefixes", description: "Numbering books for broker and regular invoices." },
  "auction.prefix-approvals": { title: "Prefix approvals", description: "Abnormal invoice-number-prefix requests awaiting supervisor decision." },
  "auction.warehouses": { title: "Warehouses", description: "Physical locations used when grouping dispatch invoices for dispatch." },
  "auction.broker-grade-thresholds": { title: "Broker grade thresholds", description: "Minimum net weights that apply to each broker and grade." },
  "auction.sale-lines": { title: "Sale lines", description: "Lots and realised sale values for this auction sale." },
  "auction.dispatches": { title: "Dispatch invoices", description: "Dispatch invoices for this factory." },
  "auction.dispatch-lots": { title: "Invoice lots", description: "Lots attached to this dispatch invoice." },
  "auction.reprint-overview": { title: "Re-print overview", description: "Historic and current lots that have been re-printed." },
  "auction.invoice-overview": { title: "Invoice overview", description: "Every lot invoice in the factory, with its dispatch invoice's attributes." },
  "auction.physical-dispatches": { title: "Physical dispatches", description: "Outbound warehouse movements that group dispatch invoices." },
  "auction.sales-side-list": { title: "Auction sales", description: "Sales grouped by target sale number, for the sale detail side rail." },
  "auction.documents-side-list": { title: "Documents", description: "Every staged or confirmed auction document, factory-wide, for the Document Details side rail." },
  "auction.eligible-broker-invoices": { title: "Eligible dispatch invoices", description: "Invoices that can still be assigned to a physical dispatch." },
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
  "users.roles": { title: "Roles", description: "Built-in and custom factory roles." },
  "users.role-page-permissions": { title: "Page permissions", description: "View and CRUD access for one factory role." },
  "users.staff-directory": { title: "Shared staff profiles", description: "Contact and employment details coworkers chose to share." },
  "leaf.weighings": { title: "Weighings", description: "Leaf intake records for the selected period and filters." },
};
