/**
 * The placeholder broker a Dispatch Invoice is filed under when the factory does
 * not yet know which house the tea is going to. `auction_sales.broker_id` is
 * NOT NULL and every grouping keys on it, so "no broker yet" has to be a real
 * broker row — one per factory, created on first use.
 *
 * Its own module because both the server actions and the invoice detail page
 * ask the same question, and _shared.ts is server-only.
 */
export const IMAGINARY_BROKER_NAME = "IMB";

export const isPlaceholderBrokerName = (name: string | null | undefined) =>
  (name ?? "").trim().toUpperCase() === IMAGINARY_BROKER_NAME;
