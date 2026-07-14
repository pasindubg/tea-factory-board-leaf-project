-- Auction Reports owns imports, settlement, VAT and bank reconciliation only.
-- Diagram-only; never a migration.
CREATE TABLE doc_imports (id uuid PRIMARY KEY, factory_id uuid NOT NULL, doc_type text NOT NULL, content_hash text NOT NULL, parsed_json jsonb, status text NOT NULL, sale_id uuid, UNIQUE(factory_id, content_hash));
CREATE TABLE settlements (id uuid PRIMARY KEY, factory_id uuid NOT NULL, sale_id uuid NOT NULL, contract_no text NOT NULL, proceeds_total numeric(14,2) NOT NULL, total_deductions numeric(14,2) NOT NULL, total_net_proceeds numeric(14,2) NOT NULL, prompt_date date, UNIQUE(factory_id, contract_no));
CREATE TABLE settlement_charges (id uuid PRIMARY KEY, factory_id uuid NOT NULL, settlement_id uuid NOT NULL REFERENCES settlements(id), code text NOT NULL, basis text NOT NULL, rate numeric(12,4), amount numeric(14,2) NOT NULL);
CREATE TABLE vat_ledger (id uuid PRIMARY KEY, factory_id uuid NOT NULL, sale_line_id uuid NOT NULL, flow text NOT NULL, vat_amount numeric(14,2) NOT NULL, mode text NOT NULL, status text NOT NULL);
CREATE TABLE bank_txns (id uuid PRIMARY KEY, factory_id uuid NOT NULL, txn_date date NOT NULL, debit numeric(14,2) NOT NULL, credit numeric(14,2) NOT NULL, matched_settlement_id uuid REFERENCES settlements(id), match_status text NOT NULL);
