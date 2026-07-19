-- Dashboard Core owns the tenant root. Diagram-only; never a migration.
CREATE TABLE factories (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  location text,
  registration_number text,
  contact_phone text,
  created_at timestamp NOT NULL DEFAULT now()
);
