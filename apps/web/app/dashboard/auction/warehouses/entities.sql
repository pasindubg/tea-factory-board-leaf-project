-- Warehouse module owns warehouse master data only. Diagram-only; never a migration.
CREATE TABLE auction_warehouses (id uuid PRIMARY KEY, factory_id uuid NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT now(), UNIQUE(factory_id, name));
