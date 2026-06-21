// Minimal row shapes the mobile field app touches. The app talks to Supabase
// directly (no @tea/db import — drizzle/postgres don't bundle in RN), so these
// mirror the columns we read/write. Money/weights are numeric in Postgres and
// arrive as strings over the wire.

export type Role =
  | "owner"
  | "manager"
  | "supervisor"
  | "accountant"
  | "collector"
  | "supplier"
  | "driver";

export type Profile = {
  id: string;
  name: string;
  role: Role;
  factory_id: string;
  supplier_id: string | null; // set for supplier-role logins (links to a suppliers row)
};

// The supplier a supplier-role login represents.
export type LinkedSupplier = { id: string; name: string; area: string | null };

// --- Field-app request catalogue (server-driven UI, see docs/mobile) ---
export type RequestField = {
  name: string;
  type: "text" | "number" | "date" | "boolean";
  label: string;
  required?: boolean;
};

export type RequestType = {
  id: string;
  key: string;
  label: string;
  fields: RequestField[];
  requires_amount: boolean;
  creates_advance: boolean;
  sort_order: number;
};

export type RequestStatus =
  | "pending"
  | "approved"
  | "declined"
  | "handed_to_driver"
  | "acknowledged"
  | "cancelled";

export type SupplierRequest = {
  id: string;
  supplier_id: string;
  type_key: string;
  amount: string | null;
  status: RequestStatus;
  note: string | null;
  requested_at: string;
  handed_at: string | null;
  acknowledged_at: string | null;
  suppliers?: { name: string } | null; // joined for the driver route view
};

// --- Factory → supplier messages (FA3) ---
export type SupplierMessage = {
  id: string;
  supplier_id: string | null; // null = broadcast to all suppliers
  title: string;
  body: string;
  sent_at: string;
  read_at: string | null;
};

// --- Legacy collector shapes (parked M4 collector screens) ---
export type CollectorRow = { id: string; name: string; area: string | null };
export type Supplier = { id: string; name: string; area: string | null };
export type Weighing = {
  id: string;
  weight_kg: string;
  collected_at: string;
  suppliers: { name: string } | null;
};
