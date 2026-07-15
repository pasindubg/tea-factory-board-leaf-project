-- Broker Invoice module owns invoice headers, lots and reconciliation audit.
-- Diagram-only; never a migration.
CREATE TABLE auction_sales (
  id uuid PRIMARY KEY,
  factory_id uuid NOT NULL,
  broker_id uuid NOT NULL,
  selling_mark_id uuid,
  bundled_dispatch_id uuid,
  broker_lorry_no text,
  driver_name text,
  sale_kind text NOT NULL DEFAULT 'dispatch',
  parent_sale_id uuid REFERENCES auction_sales(id) ON DELETE CASCADE,
  reprint_no text,
  sale_no text NOT NULL,
  dispatch_date date NOT NULL,
  target_sale_no text,
  sale_date date,
  prompt_date date,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp NOT NULL DEFAULT now(),
  created_date date GENERATED ALWAYS AS ((created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Colombo')::date) STORED NOT NULL,
  UNIQUE(factory_id, broker_id, sale_no),
  UNIQUE(factory_id, bundled_dispatch_id, broker_id, selling_mark_id)
);
CREATE TABLE auction_lots (
  id uuid PRIMARY KEY,
  factory_id uuid NOT NULL,
  sale_id uuid NOT NULL REFERENCES auction_sales(id) ON DELETE CASCADE,
  mark_id uuid,
  invoice_no text NOT NULL,
  provisional_sale_no text,
  final_sale_no text,
  lot_no text,
  grade text NOT NULL,
  bags integer,
  net_wt numeric(10,2) NOT NULL,
  state text NOT NULL DEFAULT 'invoiced',
  reprint_source_lot_id uuid REFERENCES auction_lots(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE lot_invoices (
  id uuid PRIMARY KEY,
  factory_id uuid NOT NULL,
  lot_id uuid NOT NULL REFERENCES auction_lots(id) ON DELETE CASCADE,
  invoice_no text NOT NULL,
  UNIQUE(lot_id, invoice_no)
);
CREATE TABLE auction_audit (
  id uuid PRIMARY KEY,
  factory_id uuid NOT NULL,
  sale_id uuid REFERENCES auction_sales(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES auction_lots(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text NOT NULL,
  actor text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
