-- Messages module owns supplier messages only. Diagram-only; never a migration.
CREATE TABLE supplier_messages (id uuid PRIMARY KEY, factory_id uuid NOT NULL, supplier_id uuid, title text NOT NULL, body text NOT NULL, created_by uuid, sent_at timestamp NOT NULL, read_at timestamp, created_at timestamp NOT NULL DEFAULT now());
