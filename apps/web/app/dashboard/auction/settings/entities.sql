-- Auction Settings owns grade configuration only. Diagram-only; never a migration.
CREATE TABLE auction_grades (id uuid PRIMARY KEY, factory_id uuid NOT NULL, code text NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0, UNIQUE(factory_id, code));
CREATE TABLE auction_grade_aliases (id uuid PRIMARY KEY, factory_id uuid NOT NULL, grade_id uuid NOT NULL REFERENCES auction_grades(id) ON DELETE CASCADE, alias text NOT NULL, UNIQUE(factory_id, alias));
CREATE TABLE broker_grade_thresholds (id uuid PRIMARY KEY, factory_id uuid NOT NULL, broker_id uuid NOT NULL, grade_id uuid NOT NULL REFERENCES auction_grades(id), min_net_kg numeric(10,2) NOT NULL, applies boolean NOT NULL, UNIQUE(factory_id, broker_id, grade_id));
