-- Requests module owns request definitions and supplier requests only.
-- Diagram-only; never a migration.
CREATE TABLE request_types (id uuid PRIMARY KEY, factory_id uuid NOT NULL, key text NOT NULL, label text NOT NULL, fields jsonb NOT NULL, requires_amount boolean NOT NULL, creates_advance boolean NOT NULL, active boolean NOT NULL, UNIQUE(factory_id, key));
CREATE TABLE supplier_requests (id uuid PRIMARY KEY, factory_id uuid NOT NULL, supplier_id uuid NOT NULL, type_key text NOT NULL, payload jsonb NOT NULL, amount numeric(12,2), status text NOT NULL, decided_by uuid, handed_by uuid, adjustment_id uuid, requested_at timestamp NOT NULL);
