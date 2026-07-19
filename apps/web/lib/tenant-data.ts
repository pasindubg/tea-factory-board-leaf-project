import type { createClient } from "@/lib/supabase/server";
import { friendlyDeleteError } from "./errors";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type FromBuilder = ReturnType<Supabase["from"]>;

const FACTORY_SCOPED_TABLES = new Set([
  "auction_audit",
  "auction_bundled_dispatch_invoices",
  "auction_bundled_dispatches",
  "auction_grade_aliases",
  "auction_grades",
  "auction_lots",
  "auction_sales",
  "auction_warehouses",
  "access_roles",
  "bank_txns",
  "broker_grade_thresholds",
  "broker_rates",
  "brokers",
  "buyers",
  "collectors",
  "doc_imports",
  "lot_invoices",
  "marks",
  "module_permissions",
  "payment_lines",
  "payment_settings",
  "payments",
  "price_rates",
  "quality_tiers",
  "request_types",
  "role_page_permissions",
  "sale_lines",
  "settlement_charges",
  "settlements",
  "supplier_adjustments",
  "supplier_messages",
  "supplier_requests",
  "supplier_tiers",
  "suppliers",
  "user_profiles",
  "users",
  "valuations",
  "vat_ledger",
  "weighings",
] as const);

const FACTORY_ROOT_TABLES = new Set(["factories"] as const);

export type TenantTable =
  | (typeof FACTORY_SCOPED_TABLES extends Set<infer T> ? T : never)
  | (typeof FACTORY_ROOT_TABLES extends Set<infer T> ? T : never);

type TenantScope = {
  factoryId: string;
  actorUserId: string;
};

type FilterBuilder = {
  eq(column: string, value: string): unknown;
};

function applyTenantFilter<T>(query: T, table: string, scope: TenantScope): T {
  const filterable = query as T & FilterBuilder;
  if (FACTORY_SCOPED_TABLES.has(table as never)) {
    return filterable.eq("factory_id", scope.factoryId) as T;
  }
  return filterable.eq("id", scope.factoryId) as T;
}

function tenantValues(values: unknown, factoryId: string): unknown {
  if (Array.isArray(values)) {
    return values.map((value) => tenantValues(value, factoryId));
  }
  if (values && typeof values === "object") {
    return { ...(values as Record<string, unknown>), factory_id: factoryId };
  }
  return values;
}

function scopedFrom(supabase: Supabase, table: TenantTable, scope: TenantScope): FromBuilder {
  const source = supabase.from(table);
  return new Proxy(source, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver);
      if (typeof member !== "function") return member;

      if (property === "select" || property === "delete") {
        return (...args: unknown[]) => applyTenantFilter(Reflect.apply(member, target, args), table, scope);
      }

      if (property === "update") {
        return (values: unknown, ...args: unknown[]) => {
          const scopedValues = FACTORY_SCOPED_TABLES.has(table as never)
            ? tenantValues(values, scope.factoryId)
            : values;
          return applyTenantFilter(Reflect.apply(member, target, [scopedValues, ...args]), table, scope);
        };
      }

      if (property === "insert" || property === "upsert") {
        return (values: unknown, ...args: unknown[]) => {
          if (!FACTORY_SCOPED_TABLES.has(table as never)) {
            throw new Error(`Tenant inserts are not supported for root table: ${table}`);
          }
          return Reflect.apply(member, target, [tenantValues(values, scope.factoryId), ...args]);
        };
      }

      return member.bind(target);
    },
  }) as FromBuilder;
}

/**
 * Adds the application-level tenant boundary to the signed-in Supabase client.
 * RLS remains authoritative; this wrapper is the belt-and-suspenders predicate
 * used by every server page and action after profile resolution.
 */
export function withTenantDataScope(supabase: Supabase, scope: TenantScope): Supabase {
  return new Proxy(supabase, {
    get(target, property, receiver) {
      if (property === "from") {
        return (table: string) => {
          if (!FACTORY_SCOPED_TABLES.has(table as never) && !FACTORY_ROOT_TABLES.has(table as never)) {
            throw new Error(`Tenant data access is not registered for table: ${table}`);
          }
          return scopedFrom(target, table as TenantTable, scope);
        };
      }

      const member = Reflect.get(target, property, receiver);
      return typeof member === "function" ? member.bind(target) : member;
    },
  }) as Supabase;
}

/**
 * Deletes one tenant-owned row. PostgreSQL owns relationship behavior: foreign
 * keys declared ON DELETE CASCADE remove their child rows atomically, while
 * restrictive foreign keys return a readable dependent-record error.
 */
export async function deleteTenantRow(supabase: Supabase, table: TenantTable, id: string) {
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { error: friendlyDeleteError(error) };
  if (!data) {
    return {
      error: "This record was not found or you do not have permission to delete it.",
    };
  }
  return { error: null };
}
