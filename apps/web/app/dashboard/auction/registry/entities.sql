-- Auction Registry owns brokers, selling marks and broker rates only.
-- Diagram-only; never a migration.
CREATE TABLE brokers (id uuid PRIMARY KEY, factory_id uuid NOT NULL, name text NOT NULL, vat_no text, address text, created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE marks (id uuid PRIMARY KEY, factory_id uuid NOT NULL, code text NOT NULL, name text NOT NULL, address text, created_at timestamp NOT NULL DEFAULT now(), UNIQUE(factory_id, code));
CREATE TABLE broker_rates (id uuid PRIMARY KEY, factory_id uuid NOT NULL, broker_id uuid NOT NULL REFERENCES brokers(id), effective_from date NOT NULL, insurance_per_kg numeric(10,4) NOT NULL, public_sale_ex_per_lot numeric(10,2) NOT NULL, brokerage_pct numeric(6,3) NOT NULL, handling_per_kg numeric(10,4) NOT NULL, documentation_per_lot numeric(10,2) NOT NULL, eplatform_per_kg numeric(10,4) NOT NULL, govt_relief_loan numeric(14,2) NOT NULL, charges_vat_pct numeric(6,3) NOT NULL, proceeds_vat_pct numeric(6,3) NOT NULL);
