-- Collectors module owns collectors only. Diagram-only; never a migration.
CREATE TABLE collectors (id uuid PRIMARY KEY, factory_id uuid NOT NULL, user_id uuid, name text NOT NULL, phone text, nic_number text, area text, active boolean DEFAULT true, created_at timestamp NOT NULL DEFAULT now());
