-- Suppliers module owns suppliers only. Diagram-only; never a migration.
CREATE TABLE suppliers (id uuid PRIMARY KEY, factory_id uuid NOT NULL, collector_id uuid, name text NOT NULL, phone text, nic_number text, land_size_acres numeric(8,2), area text, latitude numeric(10,7), longitude numeric(10,7), active boolean DEFAULT true, created_at timestamp NOT NULL DEFAULT now());
