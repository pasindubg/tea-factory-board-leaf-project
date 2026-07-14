-- Weighings module owns production lots and green-leaf weighings only.
-- Diagram-only; never a migration.
CREATE TABLE lots (id uuid PRIMARY KEY, factory_id uuid NOT NULL, lot_number text NOT NULL, grade text NOT NULL, date date NOT NULL, status text, notes text, UNIQUE(factory_id, lot_number));
CREATE TABLE weighings (id uuid PRIMARY KEY, factory_id uuid NOT NULL, collector_id uuid NOT NULL, supplier_id uuid NOT NULL, lot_id uuid REFERENCES lots(id), weight_kg numeric(8,2) NOT NULL, grade text NOT NULL, collected_at timestamp NOT NULL, synced_at timestamp, water_penalty boolean NOT NULL DEFAULT false, transport_applies boolean NOT NULL DEFAULT true, notes text);
