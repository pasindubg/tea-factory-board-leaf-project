-- Dispatch module owns only physical bundles and their invoice membership.
-- Diagram-only; never a migration.
CREATE TABLE auction_bundled_dispatches (
  id uuid PRIMARY KEY,
  factory_id uuid NOT NULL,
  dispatch_no text NOT NULL,
  dispatch_date date NOT NULL,
  dispatch_date_from date NOT NULL,
  dispatch_date_to date NOT NULL,
  warehouse text NOT NULL,
  auto_created boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(factory_id, dispatch_no)
);
CREATE TABLE auction_bundled_dispatch_invoices (
  id uuid PRIMARY KEY,
  factory_id uuid NOT NULL,
  bundled_dispatch_id uuid NOT NULL REFERENCES auction_bundled_dispatches(id) ON DELETE CASCADE,
  broker_invoice_id uuid NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(broker_invoice_id),
  UNIQUE(bundled_dispatch_id, broker_invoice_id)
);
CREATE UNIQUE INDEX uq_auction_auto_bundle_factory_date
  ON auction_bundled_dispatches(factory_id, dispatch_date_from)
  WHERE auto_created AND dispatch_date_from = dispatch_date_to;
