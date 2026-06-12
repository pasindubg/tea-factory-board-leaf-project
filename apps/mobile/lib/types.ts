// Minimal row shapes the collector app touches. The mobile app talks to
// Supabase directly (no @tea/db import — drizzle/postgres don't bundle in RN),
// so these mirror the columns we read/write. Money/weights are numeric in
// Postgres and arrive as strings over the wire.

export type Role = "owner" | "manager" | "collector";

export type Profile = {
  id: string;
  name: string;
  role: Role;
  factory_id: string;
};

export type CollectorRow = {
  id: string;
  name: string;
  area: string | null;
};

export type Supplier = {
  id: string;
  name: string;
  area: string | null;
};

export type Weighing = {
  id: string;
  weight_kg: string;
  collected_at: string;
  suppliers: { name: string } | null;
};
