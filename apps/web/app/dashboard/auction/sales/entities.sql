-- Auction Sales owns valuation, buyer and realised-sale entities only.
-- Diagram-only; never a migration.
CREATE TABLE valuations (id uuid PRIMARY KEY, factory_id uuid NOT NULL, lot_id uuid NOT NULL, price_min numeric(10,2), price_max numeric(10,2), projected_proceeds numeric(14,2), tasting_note text, UNIQUE(lot_id));
CREATE TABLE buyers (id uuid PRIMARY KEY, factory_id uuid NOT NULL, name text NOT NULL, vat_no text, UNIQUE(factory_id, name));
CREATE TABLE sale_lines (id uuid PRIMARY KEY, factory_id uuid NOT NULL, sale_id uuid NOT NULL, lot_id uuid NOT NULL, buyer_id uuid REFERENCES buyers(id), net_wt numeric(10,2) NOT NULL, price_per_kg numeric(12,2) NOT NULL, proceeds numeric(14,2) NOT NULL, vat_amount numeric(14,2) NOT NULL, on_guarantee boolean NOT NULL DEFAULT false, UNIQUE(lot_id));
