-- Users module owns application identities and module permissions only.
-- Diagram-only; never a migration.
CREATE TABLE users (id uuid PRIMARY KEY, factory_id uuid NOT NULL, supplier_id uuid, name text NOT NULL, email text NOT NULL, phone text, username text, role text NOT NULL, active boolean DEFAULT true, created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE module_permissions (factory_id uuid NOT NULL, module_key text NOT NULL, allowed_roles text[] NOT NULL, PRIMARY KEY(factory_id, module_key));
