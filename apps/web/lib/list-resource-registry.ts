import "server-only";

import { friendlyError } from "@/lib/errors";
import type { ListRefreshResult } from "@/lib/list-mutations";
import { isListResourceKey, type ListResourceKey, type ListResourceRequest, type ListResourceRow, type ListResourceSearch } from "@/lib/list-resources";
import { parseListScopeParams, parseNoListParams, parsePaymentPeriodParams, parseUuidListParams, parseWeighingListParams } from "@/lib/list-resource-validation";
import { requireModuleAccess, requireProfile } from "@/lib/profile";
import { formatFourDigitNo, formatSaleNo, saleNoKey, saleNoMatches } from "@/app/dashboard/auction/sale-number";
import { stateBucket } from "@/app/dashboard/auction/state-buckets";
import { ALL_WEB_ROLES, PAGE_DEFINITIONS, roleMayPerformPageAction, type Role } from "@/lib/roles";
import { dayRange } from "@/lib/dates";
import { mergeListCriteria, resolveListSearchState } from "@/lib/list-search-state";
import {
  applyAdvancedQuery,
  applyListFilters,
  applyListPage,
  DEFAULT_LIST_PAGE_SIZE,
  filterRowsByCriteria,
  splitPage,
  activeEmbeds,
  embedSelect,
  type ResourceSearchConfig,
} from "@/lib/list-search-query";

type AccessContext = Awaited<ReturnType<typeof requireModuleAccess>>;
type ResourceParams = Readonly<Record<string, unknown>>;
type ResourceSearchArgs = {
  criteria: Record<string, string>;
  advancedQuery: string | null;
  page: { offset: number; limit: number };
  columns: ResourceSearchConfig;
};
type ResourceLoader = (
  context: AccessContext,
  params: ResourceParams,
  search: ResourceSearchArgs,
) => Promise<ListRefreshResult<unknown>>;

type ResourceDefinition = {
  moduleKey: string | null;
  parse: (input: unknown) => { ok: true; value: ResourceParams } | { ok: false; error: string };
  /**
   * Presence of this field opts the resource into true DB-level search and
   * pagination. Base-table columns are auto-mapped from the UI key
   * (weightKg -> weight_kg) and need no entry; declare only joined columns and
   * JS-computed keys. Omit `search` entirely for resources that must load their
   * full row set (they still get the row-level lock/criteria filter below).
   */
  search?: ResourceSearchConfig;
  load: ResourceLoader;
};

const parseNoParams = parseNoListParams;
const parseSaleParams = (input: unknown) => parseUuidListParams(input, "saleId");
const parseRoleParams = (input: unknown) => parseUuidListParams(input, "roleId");

function rateListRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => ({
    id: row.id as string,
    brokerId: row.broker_id as string,
    broker: (row.brokers as { name?: string } | null)?.name ?? "—",
    effectiveFrom: row.effective_from as string,
    brokeragePct: Number(row.brokerage_pct),
    insurancePerKg: Number(row.insurance_per_kg),
    handlingPerKg: Number(row.handling_per_kg),
    eplatformPerKg: Number(row.eplatform_per_kg),
    publicSaleExPerLot: Number(row.public_sale_ex_per_lot),
    documentationPerLot: Number(row.documentation_per_lot),
    govtReliefLoan: Number(row.govt_relief_loan),
    chargesVatPct: Number(row.charges_vat_pct),
    proceedsVatPct: Number(row.proceeds_vat_pct),
  }));
}

type RefreshLotRow = {
  id: string;
  sale_id: string;
  invoice_no: string | null;
  provisional_sale_no: string | null;
  final_sale_no: string | null;
  lot_no: string | null;
  grade: string | null;
  bags: number | null;
  kg_per_bag: number | string | null;
  sample_allowance: number | string | null;
  net_wt: number | string | null;
  state: string | null;
  reprint_source_lot_id: string | null;
  lot_invoices: { invoice_no: string }[] | null;
  marks: { code: string; name: string | null } | null;
};

type RefreshDispatchLotRow = RefreshLotRow & {
  shutout_reason: string | null;
  lot_source: string | null;
  marks: { code: string; name: string } | null;
};

type RefreshReprintLot = RefreshLotRow & {
  created_at: string | null;
  lot_source: string | null;
  sale_lines: { net_wt: number | string | null; price_per_kg: number | string | null }[] | null;
  auction_sales: {
    id: string;
    sale_no: string | null;
    target_sale_no: string | null;
    dispatch_date: string | null;
    sale_date: string | null;
    brokers: { name: string } | null;
  } | null;
};

function reprintOverviewRows(lots: RefreshReprintLot[]) {
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const rootIdFor = (lot: RefreshReprintLot) => {
    let current = lot;
    const seen = new Set<string>();
    while (current.reprint_source_lot_id && lotById.has(current.reprint_source_lot_id) && !seen.has(current.id)) {
      seen.add(current.id);
      current = lotById.get(current.reprint_source_lot_id)!;
    }
    return current.id;
  };
  const chains = new Map<string, RefreshReprintLot[]>();
  for (const lot of lots) {
    const rootId = rootIdFor(lot);
    chains.set(rootId, [...(chains.get(rootId) ?? []), lot]);
  }

  return [...chains.entries()].map(([rootId, unsortedChain]) => {
    const chain = [...unsortedChain].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
    const lot = lotById.get(rootId) ?? chain[0];
    const terminal = [...chain].reverse().find((node) => node.state === "sold" || node.state === "settled" || (node.sale_lines?.length ?? 0) > 0);
    const invoices = [...new Set(chain.flatMap((node) => (node.lot_invoices ?? []).map((invoice) => formatFourDigitNo(invoice.invoice_no))).filter(Boolean))];
    const reprintNodes = chain.filter((node) => node.state === "re-print");
    const saleLabel = (node: RefreshReprintLot) => formatSaleNo(node.auction_sales?.target_sale_no ?? node.auction_sales?.sale_no ?? null) || "—";
    const state = stateBucket(terminal?.state ?? chain[chain.length - 1]?.state);
    const totalSampleKg = Math.max(0, ...chain.map((node) => Number(node.sample_allowance ?? 0)));
    const soldLine = terminal?.sale_lines?.[0];
    return {
      id: lot.id,
      dispatchId: lot.auction_sales?.id ?? lot.sale_id,
      dispatchNo: formatFourDigitNo(lot.auction_sales?.sale_no ?? null),
      saleNo: formatSaleNo(lot.auction_sales?.target_sale_no ?? null),
      broker: lot.auction_sales?.brokers?.name ?? "—",
      dispatchDate: lot.auction_sales?.dispatch_date ?? null,
      saleDate: lot.auction_sales?.sale_date ?? null,
      invoiceNo: invoices.length > 0 ? invoices.join(", ") : formatFourDigitNo(lot.invoice_no),
      lotNo: formatFourDigitNo(lot.lot_no),
      grade: lot.grade,
      bags: lot.bags,
      kgPerBag: lot.kg_per_bag != null ? Number(lot.kg_per_bag) : null,
      totalSampleKg,
      remainingNetKg: Number(chain[chain.length - 1]?.net_wt ?? 0),
      actualSoldKg: terminal ? Number(soldLine?.net_wt ?? terminal.net_wt ?? 0) : null,
      reprintSales: reprintNodes.map(saleLabel).join(", ") || "—",
      soldSale: terminal ? saleLabel(terminal) : null,
      history: chain.map((node) => `${saleLabel(node)} ${stateBucket(node.state).label}`).join(" → "),
      source: lot.lot_source,
      stateLabel: state.label,
      stateStyle: state.style,
      reprintCount: reprintNodes.length,
    };
  });
}

type RefreshSaleLineRow = {
  lot_id: string | null;
  net_wt: number | string | null;
  price_per_kg: number | string | null;
  proceeds: number | string | null;
  vat_amount: number | string | null;
  on_guarantee: boolean | null;
  buyers: { name: string; vat_no: string | null } | null;
};

const resources: Record<ListResourceKey, ResourceDefinition> = {
  // Generic, list-agnostic: restores one list instance's saved+locked search
  // state by its own `scope` string. Every list (live or local/side-panel)
  // calls this the same way — nothing here names a specific list.
  "framework.search-state": {
    moduleKey: null,
    parse: parseListScopeParams,
    async load({ supabase, profile }, params) {
      const state = await resolveListSearchState(supabase, profile, params.listScope as string);
      return {
        ok: true,
        rows: [{ saved: state.saved, savedAdvancedQuery: state.savedAdvancedQuery, locked: state.locked, canManageLocks: state.canManageLocks }],
      };
    },
  },
  "leaf.weighings": {
    moduleKey: "weighings",
    parse: parseWeighingListParams,
    // suppliers/collectors FKs are NOT NULL, so !inner never drops a real row.
    search: { columns: {
      collectedAt: { column: "collected_at", mode: "day" },
      supplierName: { column: "suppliers.name", mode: "contains", embed: "suppliers" },
      collectorName: { column: "collectors.name", mode: "contains", embed: "collectors" },
      weightKg: { column: "weight_kg", mode: "equals" },
    } },
    async load({ supabase, profile }, params, search) {
      let collectorId = params.collectorId as string | undefined;
      if (profile.role === "collector") {
        const { data: ownCollector } = await supabase.from("collectors").select("id").eq("user_id", profile.id).maybeSingle();
        collectorId = ownCollector?.id as string | undefined;
        if (!collectorId) return { ok: true, rows: [] };
      }
      let query = supabase
        .from("weighings")
        .select("id, weight_kg, collected_at, notes, suppliers!inner(name), collectors!inner(name)");
      if (typeof params.from === "string") query = query.gte("collected_at", dayRange(params.from).start);
      if (typeof params.to === "string") query = query.lt("collected_at", dayRange(params.to).end);
      if (typeof params.supplierId === "string") query = query.eq("supplier_id", params.supplierId);
      if (collectorId) query = query.eq("collector_id", collectorId);
      query = applyListFilters(query, search.criteria, search.columns);
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("collected_at", { ascending: false }).order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows: page, hasMore } = splitPage(data ?? [], search.page.limit);
      return {
        ok: true,
        hasMore,
        rows: page.map((weighing) => ({
          id: weighing.id,
          collectedAt: weighing.collected_at,
          supplierName: (weighing.suppliers as unknown as { name: string } | null)?.name ?? "—",
          collectorName: (weighing.collectors as unknown as { name: string } | null)?.name ?? "—",
          weightKg: Number(weighing.weight_kg),
          notes: weighing.notes,
        })),
      };
    },
  },
  "users.accounts": {
    moduleKey: "users",
    parse: parseNoParams,
    search: { columns: {
      active: { column: "active", mode: "equals" },
    } },
    async load({ supabase }, _params, search) {
      // access_roles is a small per-factory lookup used to label the page's
      // users; it is not the paginated set, so it stays a single fetch.
      let usersQuery = supabase
        .from("users")
        .select("id, name, email, username, role, access_role_id, active, created_at");
      usersQuery = applyListFilters(usersQuery, search.criteria, search.columns);
      usersQuery = applyAdvancedQuery(usersQuery, search.advancedQuery, search.columns);
      const [{ data, error }, { data: roles, error: rolesError }] = await Promise.all([
        applyListPage(usersQuery.order("created_at").order("id"), search.page),
        supabase.from("access_roles").select("id, name, base_role"),
      ]);
      if (error || rolesError) return { ok: false, error: friendlyError(error ?? rolesError) };
      const roleById = new Map((roles ?? []).map((role) => [role.id as string, role]));
      const { rows: page, hasMore } = splitPage(data ?? [], search.page.limit);
      return {
        ok: true,
        hasMore,
        rows: page.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: roleById.get(user.access_role_id as string)?.name ?? user.role,
          accessRoleId: user.access_role_id,
          baseRole: roleById.get(user.access_role_id as string)?.base_role ?? user.role,
          active: user.active !== false,
        })),
      };
    },
  },
  "users.roles": {
    moduleKey: "roles",
    parse: parseNoParams,
    search: { columns: { baseRole: { column: "base_role", mode: "equals" } } },
    async load({ supabase }, _params, search) {
      let query = applyListFilters(
        supabase.from("access_roles").select("id, key, name, base_role, system_role, active"),
        search.criteria,
        search.columns,
      );
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("system_role", { ascending: false }).order("name").order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows: page, hasMore } = splitPage(data ?? [], search.page.limit);
      return {
        ok: true,
        hasMore,
        rows: page.map((role) => ({
          id: role.id,
          key: role.key,
          name: role.name,
          baseRole: role.base_role,
          systemRole: role.system_role,
          active: role.active,
        })),
      };
    },
  },
  "users.role-page-permissions": {
    moduleKey: "roles",
    parse: parseRoleParams,
    async load({ supabase }, params) {
      const roleId = params.roleId as string;
      const { data: role, error: roleError } = await supabase
        .from("access_roles")
        .select("id, base_role")
        .eq("id", roleId)
        .maybeSingle();
      if (roleError) return { ok: false, error: friendlyError(roleError) };
      if (!role) return { ok: false, error: "Role not found." };
      const { data, error } = await supabase
        .from("role_page_permissions")
        .select("page_key, can_view, can_create, can_update, can_delete")
        .eq("role_id", roleId);
      if (error) return { ok: false, error: friendlyError(error) };
      const saved = new Map((data ?? []).map((permission) => [permission.page_key as string, permission]));
      return {
        ok: true,
        rows: PAGE_DEFINITIONS.map((page) => {
          const permission = saved.get(page.key);
          const allowedActions = (["view", "create", "update", "delete"] as const)
            .filter((action) => roleMayPerformPageAction(role.base_role as Role, page, action));
          return {
            key: page.key,
            label: page.label,
            href: page.href,
            group: page.group,
            allowedActions,
            canView: permission ? Boolean(permission.can_view) : roleMayPerformPageAction(role.base_role as Role, page, "view"),
            canCreate: permission ? Boolean(permission.can_create) : roleMayPerformPageAction(role.base_role as Role, page, "create"),
            canUpdate: permission ? Boolean(permission.can_update) : roleMayPerformPageAction(role.base_role as Role, page, "update"),
            canDelete: permission ? Boolean(permission.can_delete) : roleMayPerformPageAction(role.base_role as Role, page, "delete"),
          };
        }),
      };
    },
  },
  "users.staff-directory": {
    moduleKey: null,
    parse: parseNoParams,
    async load({ supabase }) {
      const { data, error } = await supabase.rpc("list_visible_staff_profiles");
      if (error) return { ok: false, error: friendlyError(error) };
      return {
        ok: true,
        rows: ((data ?? []) as {
          user_id: string;
          full_name: string;
          role: string;
          phone: string | null;
          job_title: string | null;
          department: string | null;
          employment_type: string | null;
        }[]).map((staff) => ({
          id: staff.user_id,
          fullName: staff.full_name,
          role: staff.role,
          phone: staff.phone,
          jobTitle: staff.job_title,
          department: staff.department,
          employmentType: staff.employment_type,
        })),
      };
    },
  },
  "payments.adjustments": {
    moduleKey: "payments",
    parse: parseNoParams,
    search: { columns: {
      occurredOn: { column: "occurred_on", mode: "equals" },
      supplierName: { column: "suppliers.name", mode: "contains", embed: "suppliers" },
      kind: { column: "kind", mode: "equals" },
    } },
    async load({ supabase }, _params, search) {
      // The old hard `.limit(50)` is replaced by real paging — the list can now
      // reach every adjustment instead of silently stopping at the newest 50.
      let query = supabase
        .from("supplier_adjustments")
        .select("id, kind, label, amount, percent, occurred_on, suppliers!inner(name)");
      query = applyListFilters(query, search.criteria, search.columns);
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("occurred_on", { ascending: false }).order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows: page, hasMore } = splitPage(data ?? [], search.page.limit);
      return {
        ok: true,
        hasMore,
        rows: page.map((adjustment) => ({
          id: adjustment.id,
          occurredOn: adjustment.occurred_on,
          supplierName: (adjustment.suppliers as unknown as { name: string } | null)?.name ?? "—",
          kind: adjustment.kind,
          label: adjustment.label,
          amount: adjustment.amount,
          percent: adjustment.percent,
        })),
      };
    },
  },
  "payments.tier-assignments": {
    moduleKey: "payments",
    parse: parseNoParams,
    search: { columns: {
      supplierName: { column: "name", mode: "contains" },
    } },
    async load({ supabase }, _params, search) {
      // Suppliers is the paginated set; tier assignments are then fetched only
      // for the supplier ids on this page rather than for the whole factory.
      let supplierQuery = supabase.from("suppliers").select("id, name, area").eq("active", true);
      supplierQuery = applyListFilters(supplierQuery, search.criteria, search.columns);
      supplierQuery = applyAdvancedQuery(supplierQuery, search.advancedQuery, search.columns);
      const { data: supplierData, error } = await applyListPage(supplierQuery.order("name").order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows: suppliers, hasMore } = splitPage(supplierData ?? [], search.page.limit);
      const supplierIds = suppliers.map((supplier) => supplier.id as string);
      const { data: assignments, error: assignmentError } = supplierIds.length
        ? await supabase
            .from("supplier_tiers")
            .select("supplier_id, effective_from, source, quality_tiers(name)")
            .is("effective_to", null)
            .in("supplier_id", supplierIds)
        : { data: [], error: null };
      if (assignmentError) return { ok: false, error: friendlyError(assignmentError) };
      const current = new Map((assignments ?? []).map((assignment) => [assignment.supplier_id as string, assignment]));
      return {
        ok: true,
        hasMore,
        rows: suppliers.map((supplier) => {
          const assignment = current.get(supplier.id as string);
          return {
            id: supplier.id,
            supplierName: supplier.name,
            area: supplier.area,
            tierName: (assignment?.quality_tiers as unknown as { name: string } | null)?.name ?? null,
            effectiveFrom: (assignment?.effective_from as string | null | undefined) ?? null,
            source: (assignment?.source as string | null | undefined) ?? null,
          };
        }),
      };
    },
  },
  "payments.quality-tiers": {
    moduleKey: "payments",
    parse: parseNoParams,
    search: { columns: { active: { column: "active", mode: "equals" } } },
    async load({ supabase }, _params, search) {
      let query = applyListFilters(
        supabase.from("quality_tiers").select("id, name, bonus_kind, bonus_value, sort_order, active"),
        search.criteria,
        search.columns,
      );
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("sort_order").order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows: page, hasMore } = splitPage(data ?? [], search.page.limit);
      return {
        ok: true,
        hasMore,
        rows: page.map((tier) => ({
          id: tier.id,
          name: tier.name,
          bonusKind: tier.bonus_kind,
          bonusValue: tier.bonus_value,
          sortOrder: tier.sort_order,
          active: Boolean(tier.active),
        })),
      };
    },
  },
  "payments.base-rates": {
    moduleKey: "payments",
    parse: parseNoParams,
    search: { columns: { effectiveFrom: { column: "effective_from", mode: "equals" } } },
    async load({ supabase }, _params, search) {
      let query = applyListFilters(
        supabase.from("price_rates").select("id, price_per_kg, effective_from, effective_to").eq("grade", "GREEN_LEAF"),
        search.criteria,
        search.columns,
      );
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("effective_from", { ascending: false }).order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows: page, hasMore } = splitPage(data ?? [], search.page.limit);
      return {
        ok: true,
        hasMore,
        rows: page.map((rate) => ({
          id: rate.id,
          pricePerKg: rate.price_per_kg,
          effectiveFrom: rate.effective_from,
          effectiveTo: rate.effective_to,
        })),
      };
    },
  },
  "payments.statements": {
    moduleKey: "payments",
    parse: parsePaymentPeriodParams,
    search: { columns: {
      supplierName: { column: "suppliers.name", mode: "contains", embed: "suppliers" },
      status: { column: "status", mode: "equals" },
    } },
    async load({ supabase }, params, search) {
      const year = params.year as number;
      const month = params.month as number;
      let query = supabase
        .from("payments")
        .select("id, total_kg, gross_amount, deduction_amount, total_amount, status, suppliers!inner(name)")
        .eq("period_year", year)
        .eq("period_month", month);
      query = applyListFilters(query, search.criteria, search.columns);
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("created_at").order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows: page, hasMore } = splitPage(data ?? [], search.page.limit);
      return {
        ok: true,
        hasMore,
        rows: page.map((payment) => ({
          id: payment.id,
          supplierName: (payment.suppliers as unknown as { name: string } | null)?.name ?? "—",
          totalKg: Number(payment.total_kg),
          grossAmount: Number(payment.gross_amount),
          deductionAmount: Number(payment.deduction_amount),
          totalAmount: Number(payment.total_amount),
          status: payment.status,
        })),
      };
    },
  },
  "communications.sent-messages": {
    moduleKey: "messages",
    parse: parseNoParams,
    search: { columns: {
      recipient: { column: "suppliers.name", mode: "contains", embed: "suppliers" },
      sentAt: { column: "sent_at", mode: "day" },
    } },
    async load({ supabase }, _params, search) {
      // supplier_id is nullable here (a broadcast to all suppliers), so the
      // embed is only promoted to !inner while a recipient filter is active —
      // otherwise broadcasts would silently vanish from the list.
      const embeds = activeEmbeds(search.criteria, search.advancedQuery, search.columns);
      let query = supabase
        .from("supplier_messages")
        .select(embedSelect("id, title, body, supplier_id, sent_at, suppliers(name)", embeds));
      query = applyListFilters(query, search.criteria, search.columns);
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("sent_at", { ascending: false }).order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows: page, hasMore } = splitPage((data ?? []) as unknown as Record<string, unknown>[], search.page.limit);
      return {
        ok: true,
        hasMore,
        rows: page.map((message) => ({
          id: message.id,
          title: message.title,
          body: message.body,
          supplierId: message.supplier_id,
          recipient: message.supplier_id
            ? (message.suppliers as unknown as { name: string } | null)?.name ?? "Supplier"
            : "All suppliers",
          sentAt: message.sent_at,
        })),
      };
    },
  },
  "communications.supplier-requests": {
    moduleKey: "requests",
    parse: parseNoParams,
    async load({ supabase }) {
      const [{ data: requests, error }, { data: types, error: typeError }] = await Promise.all([
        supabase
          .from("supplier_requests")
          .select("id, supplier_id, type_key, amount, status, note, requested_at, handed_at, suppliers(name)")
          .order("requested_at", { ascending: false }),
        supabase.from("request_types").select("key, label"),
      ]);
      if (error || typeError) return { ok: false, error: friendlyError(error ?? typeError) };
      const labels = new Map((types ?? []).map((type) => [type.key as string, type.label as string]));
      return {
        ok: true,
        rows: (requests ?? []).map((request) => ({
          id: request.id,
          supplierId: request.supplier_id,
          supplierName: (request.suppliers as unknown as { name: string } | null)?.name ?? "—",
          typeKey: request.type_key,
          typeLabel: labels.get(request.type_key) ?? request.type_key,
          amount: request.amount,
          status: request.status,
          note: request.note,
          requestedAt: request.requested_at,
          handedAt: request.handed_at,
        })),
      };
    },
  },
  "leaf.suppliers": {
    moduleKey: "suppliers",
    parse: parseNoParams,
    search: { columns: {
      active: { column: "active", mode: "equals" },
    } },
    async load({ supabase }, _params, search) {
      let query = applyListFilters(
        supabase.from("suppliers").select("id, name, phone, nic_number, area, land_size_acres, collector_id, active, collectors(name)"),
        search.criteria,
        search.columns,
      );
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("active", { ascending: false }).order("name").order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows: page, hasMore } = splitPage(data ?? [], search.page.limit);
      return {
        ok: true,
        hasMore,
        rows: page.map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
          area: supplier.area,
          phone: supplier.phone,
          nicNumber: supplier.nic_number,
          collectorId: supplier.collector_id,
          collectorName: (supplier.collectors as unknown as { name: string } | null)?.name ?? "—",
          landSizeAcres: supplier.land_size_acres,
          active: Boolean(supplier.active),
        })),
      };
    },
  },
  "leaf.collectors": {
    moduleKey: "collectors",
    parse: parseNoParams,
    search: { columns: {
      active: { column: "active", mode: "equals" },
    } },
    async load({ supabase }, _params, search) {
      let query = applyListFilters(
        supabase.from("collectors").select("id, name, phone, nic_number, area, active"),
        search.criteria,
        search.columns,
      );
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("active", { ascending: false }).order("name").order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows: page, hasMore } = splitPage(data ?? [], search.page.limit);
      return {
        ok: true,
        hasMore,
        rows: page.map((collector) => ({
          id: collector.id,
          name: collector.name,
          area: collector.area,
          phone: collector.phone,
          nicNumber: collector.nic_number,
          active: Boolean(collector.active),
        })),
      };
    },
  },
  "auction.brokers": {
    moduleKey: "auction",
    parse: parseNoParams,
    search: { columns: {
    } },
    async load({ supabase }, _params, search) {
      let query = applyListFilters(supabase.from("brokers").select("id, name, vat_no, address"), search.criteria, search.columns);
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("name").order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows, hasMore } = splitPage(data ?? [], search.page.limit);
      return { ok: true, rows, hasMore };
    },
  },
  "auction.dispatches": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const [{ data: sales, error }, { data: marks, error: markError }, { data: bundles, error: bundleError }] = await Promise.all([
        supabase
          .from("auction_sales")
          .select("id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, status, selling_mark_id, broker_lorry_no, driver_name, transporter, bundled_dispatch_id, created_date, brokers(name)")
          .eq("sale_kind", "dispatch")
          .order("created_at", { ascending: false }),
        supabase.from("marks").select("id, code, name").order("code"),
        supabase.from("auction_bundled_dispatches").select("id, dispatch_no"),
      ]);
      if (error || markError || bundleError) return { ok: false, error: friendlyError(error ?? markError ?? bundleError) };
      const markById = new Map((marks ?? []).map((mark) => [mark.id as string, `${mark.code as string}${mark.name ? ` — ${mark.name as string}` : ""}`]));
      const bundleNoById = new Map((bundles ?? []).map((bundle) => [bundle.id as string, formatFourDigitNo(bundle.dispatch_no as string)]));
      return {
        ok: true,
        rows: (sales ?? []).map((sale) => ({
          id: sale.id as string,
          sale_no: formatFourDigitNo(sale.sale_no as string),
          target_sale_no: formatSaleNo((sale as { target_sale_no?: string }).target_sale_no),
          dispatch_date: (sale as { dispatch_date?: string | null }).dispatch_date ?? null,
          sale_date: (sale.sale_date as string | null | undefined) ?? null,
          prompt_date: (sale.prompt_date as string | null | undefined) ?? null,
          status: sale.status as string,
          selling_mark: markById.get((sale as { selling_mark_id?: string | null }).selling_mark_id ?? "") ?? null,
          broker_lorry_no: (sale as { broker_lorry_no?: string | null }).broker_lorry_no ?? null,
          driver_name: (sale as { driver_name?: string | null }).driver_name ?? null,
          transporter: (sale as { transporter?: string | null }).transporter ?? null,
          bundle_dispatch_no: bundleNoById.get((sale as { bundled_dispatch_id?: string | null }).bundled_dispatch_id ?? "") ?? null,
          created_date: (sale as { created_date?: string | null }).created_date ?? null,
          brokers: (sale.brokers as unknown as { name: string } | null) ?? null,
        })),
      };
    },
  },
  "auction.physical-dispatches": {
    moduleKey: "auction",
    parse: parseNoParams,
    search: {
      columns: {
        // Both are `date` columns — ilike would error on them.
        dispatchDateFrom: { column: "dispatch_date_from", mode: "equals" },
        dispatchDateTo: { column: "dispatch_date_to", mode: "equals" },
      },
      // Derived from the count of joined invoice rows; no column to filter on.
      computed: ["invoiceCount"],
    },
    async load({ supabase }, _params, search) {
      let query = supabase
        .from("auction_bundled_dispatches")
        .select("id, dispatch_no, dispatch_date_from, dispatch_date_to, warehouse, status, auction_bundled_dispatch_invoices(id)");
      query = applyListFilters(query, search.criteria, search.columns);
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(
        query.order("dispatch_date_from", { ascending: false }).order("dispatch_no", { ascending: false }).order("id"),
        search.page,
      );
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows: pageRows, hasMore } = splitPage((data ?? []) as unknown as {
        id: string;
        dispatch_no: string;
        dispatch_date_from: string;
        dispatch_date_to: string;
        warehouse: string;
        status: string;
        auction_bundled_dispatch_invoices: { id: string }[] | null;
      }[], search.page.limit);
      return {
        ok: true,
        hasMore,
        rows: pageRows.map((dispatch) => ({
          id: dispatch.id,
          dispatchNo: formatFourDigitNo(dispatch.dispatch_no),
          dispatchDateFrom: dispatch.dispatch_date_from,
          dispatchDateTo: dispatch.dispatch_date_to,
          warehouse: dispatch.warehouse,
          invoiceCount: dispatch.auction_bundled_dispatch_invoices?.length ?? 0,
          status: dispatch.status,
        })),
      };
    },
  },
  // A "sale" is a virtual grouping over auction_sales.target_sale_no (or its
  // own sale_no before assignment), not a real table — so this stays a plain
  // JS aggregation rather than a `search`-config'd SQL query like the
  // dispatches resource above. It's still registry-backed (not a local/scope
  // list), so it gets the same real, persisted, role-locked search enforcement
  // as every other rail: the generic `filterRowsByCriteria` fallback in
  // `loadListResource` below matches criteria keys straight against these
  // rows' own fields, and every applySearch re-executes this loader instead
  // of only filtering whatever rows were fetched once at initial render.
  "auction.sales-side-list": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const [{ data: dispatches, error: dispatchError }, { data: lots, error: lotError }] = await Promise.all([
        supabase
          .from("auction_sales")
          .select("id, sale_no, target_sale_no, sale_date, status, brokers(name)")
          .eq("sale_kind", "dispatch"),
        supabase
          .from("auction_lots")
          .select("id, sale_id, provisional_sale_no, final_sale_no"),
      ]);
      if (dispatchError || lotError) return { ok: false, error: friendlyError(dispatchError ?? lotError) };

      type DispatchRow = { id: string; sale_no: string; target_sale_no: string | null; sale_date: string | null; status: string; brokers: { name: string } | null };
      type LotRow = { id: string; sale_id: string; provisional_sale_no: string | null; final_sale_no: string | null };
      const dispatchRows = (dispatches ?? []) as unknown as DispatchRow[];
      const lotRows = (lots ?? []) as unknown as LotRow[];
      const dispatchById = new Map(dispatchRows.map((dispatch) => [dispatch.id, dispatch]));

      const summaries = new Map<string, {
        saleNo: string;
        dispatchNos: Map<string, string>;
        brokers: Set<string>;
        saleDate: string | null;
        statuses: Set<string>;
      }>();
      function addSummary(key: string, dispatch: DispatchRow) {
        const current = summaries.get(key) ?? {
          saleNo: key,
          dispatchNos: new Map<string, string>(),
          brokers: new Set<string>(),
          saleDate: dispatch.sale_date,
          statuses: new Set<string>(),
        };
        current.dispatchNos.set(dispatch.id, formatFourDigitNo(dispatch.sale_no));
        if (dispatch.brokers?.name) current.brokers.add(dispatch.brokers.name);
        current.saleDate ??= dispatch.sale_date;
        current.statuses.add(stateBucket(dispatch.status).label);
        summaries.set(key, current);
      }
      for (const dispatch of dispatchRows) {
        const key = formatSaleNo(saleNoKey(dispatch.target_sale_no || dispatch.sale_no));
        if (key) addSummary(key, dispatch);
      }
      for (const lot of lotRows) {
        const dispatch = dispatchById.get(lot.sale_id);
        const key = formatSaleNo(saleNoKey(lot.final_sale_no || lot.provisional_sale_no));
        if (dispatch && key) addSummary(key, dispatch);
      }

      return {
        ok: true,
        rows: [...summaries.values()]
          .sort((a, b) => b.saleNo.localeCompare(a.saleNo, undefined, { numeric: true }))
          .map((sale) => ({
            saleNo: sale.saleNo,
            dispatchNos: [...sale.dispatchNos.values()],
            brokers: [...sale.brokers].sort((a, b) => a.localeCompare(b)),
            saleDate: sale.saleDate,
            statuses: [...sale.statuses].sort((a, b) => a.localeCompare(b)),
          })),
      };
    },
  },
  "auction.eligible-broker-invoices": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("auction_sales")
        .select("id, sale_no, dispatch_date, status, brokers(name), auction_lots(id)")
        .eq("sale_kind", "dispatch")
        .is("bundled_dispatch_id", null)
        .order("dispatch_date", { ascending: false })
        .order("sale_no", { ascending: false });
      if (error) return { ok: false, error: friendlyError(error) };

      return {
        ok: true,
        rows: (data ?? []).map((invoice) => ({
          id: invoice.id as string,
          invoiceNo: formatFourDigitNo(invoice.sale_no as string),
          broker: (invoice.brokers as unknown as { name?: string } | null)?.name ?? "—",
          invoiceDate: String(invoice.dispatch_date ?? "").slice(0, 10),
          status: invoice.status as string,
          lotCount: (invoice.auction_lots as unknown as { id: string }[] | null)?.length ?? 0,
        })),
      };
    },
  },
  "auction.dispatch-lots": {
    moduleKey: "auction",
    parse: parseSaleParams,
    async load({ supabase, profile }, params) {
      const saleId = params.saleId as string;
      const { data: brokerInvoice, error: brokerInvoiceError } = await supabase
        .from("auction_sales")
        .select("id, broker_id")
        .eq("id", saleId)
        .eq("factory_id", profile.factory_id)
        .eq("sale_kind", "dispatch")
        .maybeSingle();
      if (brokerInvoiceError) return { ok: false, error: friendlyError(brokerInvoiceError) };
      if (!brokerInvoice) return { ok: false, error: "Broker invoice not found." };

      const [{ data: lots, error: lotError }, { data: thresholds, error: thresholdError }] = await Promise.all([
        supabase
          .from("auction_lots")
          .select("id, sale_id, invoice_no, provisional_sale_no, final_sale_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state, shutout_reason, lot_source, reprint_source_lot_id, marks(code, name), lot_invoices(invoice_no)")
          .eq("sale_id", saleId)
          .eq("factory_id", profile.factory_id)
          .order("invoice_no"),
        supabase
          .from("broker_grade_thresholds")
          .select("min_net_kg, applies, auction_grades(code)")
          .eq("broker_id", brokerInvoice.broker_id as string)
          .eq("factory_id", profile.factory_id),
      ]);
      if (lotError || thresholdError) return { ok: false, error: friendlyError(lotError ?? thresholdError) };

      const thresholdByGrade = new Map<string, { minNetKg: number; applies: boolean }>();
      for (const threshold of (thresholds ?? []) as unknown as {
        min_net_kg: string | number;
        applies: boolean;
        auction_grades: { code: string }[] | { code: string } | null;
      }[]) {
        const grade = Array.isArray(threshold.auction_grades) ? threshold.auction_grades[0] : threshold.auction_grades;
        if (grade?.code) {
          thresholdByGrade.set(grade.code, {
            minNetKg: Number(threshold.min_net_kg),
            applies: Boolean(threshold.applies),
          });
        }
      }

      return {
        ok: true,
        rows: ((lots ?? []) as unknown as RefreshDispatchLotRow[]).map((lot) => {
          const threshold = thresholdByGrade.get(lot.grade ?? "");
          return {
            id: lot.id,
            invoice_no: formatFourDigitNo(lot.invoice_no) || null,
            provisional_sale_no: formatSaleNo(lot.provisional_sale_no) || null,
            final_sale_no: formatSaleNo(lot.final_sale_no) || null,
            lot_no: formatFourDigitNo(lot.lot_no) || null,
            grade: lot.grade,
            bags: lot.bags,
            kg_per_bag: lot.kg_per_bag == null ? null : Number(lot.kg_per_bag),
            sample_allowance: lot.sample_allowance == null ? null : Number(lot.sample_allowance),
            net_wt: lot.net_wt == null ? null : Number(lot.net_wt),
            state: lot.state,
            shutout_reason: lot.shutout_reason,
            lot_source: lot.lot_source,
            reprint_target_sale_id: null,
            reprint_target_label: null,
            threshold_min_net_kg: threshold?.minNetKg ?? null,
            threshold_applies: threshold?.applies ?? false,
            marks: lot.marks,
            lot_invoices: (lot.lot_invoices ?? []).map((invoice) => ({
              invoice_no: formatFourDigitNo(invoice.invoice_no),
            })),
          };
        }),
      };
    },
  },
  "auction.reprint-overview": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("auction_lots")
        .select(
          "id, sale_id, invoice_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state, lot_source, reprint_source_lot_id, created_at, " +
            "lot_invoices(invoice_no), sale_lines(net_wt, price_per_kg), " +
            "auction_sales(id, sale_no, target_sale_no, dispatch_date, sale_date, brokers(name))",
        )
        .or("state.eq.re-print,reprint_source_lot_id.not.is.null")
        .order("created_at");
      if (error) return { ok: false, error: friendlyError(error) };
      return { ok: true, rows: reprintOverviewRows((data ?? []) as unknown as RefreshReprintLot[]) };
    },
  },
  "auction.marks": {
    moduleKey: "auction",
    parse: parseNoParams,
    search: { columns: {
    } },
    async load({ supabase }, _params, search) {
      let query = applyListFilters(supabase.from("marks").select("id, code, name, address"), search.criteria, search.columns);
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("code").order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows, hasMore } = splitPage(data ?? [], search.page.limit);
      return { ok: true, rows, hasMore };
    },
  },
  "auction.broker-rates": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("broker_rates")
        .select("id, broker_id, effective_from, brokerage_pct, insurance_per_kg, handling_per_kg, eplatform_per_kg, public_sale_ex_per_lot, documentation_per_lot, govt_relief_loan, charges_vat_pct, proceeds_vat_pct, brokers(name)")
        .order("effective_from", { ascending: false });
      if (error) return { ok: false, error: friendlyError(error) };
      return { ok: true, rows: rateListRows((data ?? []) as unknown as Record<string, unknown>[]) };
    },
  },
  "auction.grades": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const [{ data: grades, error }, { data: aliases, error: aliasError }] = await Promise.all([
        supabase.from("auction_grades").select("id, code, name, active, sort_order, sample_weight, default_kg_per_bag").order("sort_order").order("code"),
        supabase.from("auction_grade_aliases").select("grade_id, alias").order("alias"),
      ]);
      if (error || aliasError) return { ok: false, error: friendlyError(error ?? aliasError) };
      const aliasesByGrade = new Map<string, string[]>();
      for (const alias of (aliases ?? []) as { grade_id: string; alias: string }[]) {
        aliasesByGrade.set(alias.grade_id, [...(aliasesByGrade.get(alias.grade_id) ?? []), alias.alias]);
      }
      return {
        ok: true,
        rows: ((grades ?? []) as { id: string; code: string; name: string; active: boolean; sort_order: number | null; sample_weight: string | number | null; default_kg_per_bag: string | number | null }[]).map((grade) => ({
          id: grade.id,
          code: grade.code,
          name: grade.name,
          active: grade.active,
          sortOrder: grade.sort_order ?? 0,
          sampleWeight: grade.sample_weight == null ? null : Number(grade.sample_weight),
          defaultKgPerBag: grade.default_kg_per_bag == null ? null : Number(grade.default_kg_per_bag),
          aliases: aliasesByGrade.get(grade.id) ?? [],
        })),
      };
    },
  },
  "auction.invoice-prefixes": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("invoice_number_prefixes")
        .select("id, category, prefix, active, created_at")
        .order("category")
        .order("prefix");
      if (error) return { ok: false, error: friendlyError(error) };
      return {
        ok: true,
        rows: ((data ?? []) as { id: string; category: string; prefix: string; active: boolean; created_at: string | null }[]).map((row) => ({
          id: row.id,
          category: row.category,
          prefix: row.prefix,
          active: row.active,
          createdAt: row.created_at,
        })),
      };
    },
  },
  "auction.prefix-approvals": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const [{ data, error }, { data: prefixRows, error: prefixError }] = await Promise.all([
        supabase
          .from("invoice_prefix_exceptions")
          .select("id, category, requested_prefix_id, context_id, payload, status, requested_by, requested_at, decided_by, decided_at, created_record_id, note")
          .order("requested_at", { ascending: false }),
        supabase.from("invoice_number_prefixes").select("id, prefix"),
      ]);
      if (error || prefixError) return { ok: false, error: friendlyError(error ?? prefixError) };
      const prefixById = new Map(((prefixRows ?? []) as { id: string; prefix: string }[]).map((p) => [p.id, p.prefix]));
      const userIds = [...new Set(
        (data ?? []).flatMap((row) => [row.requested_by as string | null, row.decided_by as string | null]).filter((id): id is string => Boolean(id)),
      )];
      const { data: userRows } = userIds.length
        ? await supabase.from("users").select("id, name").in("id", userIds)
        : { data: [] as { id: string; name: string }[] };
      const nameById = new Map(((userRows ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));
      return {
        ok: true,
        rows: ((data ?? []) as {
          id: string; category: string; requested_prefix_id: string; context_id: string | null;
          payload: Record<string, unknown>; status: string; requested_by: string | null; requested_at: string | null;
          decided_by: string | null; decided_at: string | null; created_record_id: string | null; note: string | null;
        }[]).map((row) => ({
          id: row.id,
          category: row.category,
          requestedPrefix: prefixById.get(row.requested_prefix_id) ?? "—",
          contextId: row.context_id,
          status: row.status,
          requestedByName: row.requested_by ? nameById.get(row.requested_by) ?? null : null,
          requestedAt: row.requested_at,
          decidedByName: row.decided_by ? nameById.get(row.decided_by) ?? null : null,
          decidedAt: row.decided_at,
          createdRecordId: row.created_record_id,
          note: row.note,
          payload: row.payload ?? {},
        })),
      };
    },
  },
  "auction.warehouses": {
    moduleKey: "auction",
    parse: parseNoParams,
    search: {},
    async load({ supabase }, _params, search) {
      let query = applyListFilters(supabase.from("auction_warehouses").select("id, name, active"), search.criteria, search.columns);
      query = applyAdvancedQuery(query, search.advancedQuery, search.columns);
      const { data, error } = await applyListPage(query.order("name").order("id"), search.page);
      if (error) return { ok: false, error: friendlyError(error) };
      const { rows, hasMore } = splitPage(data ?? [], search.page.limit);
      return { ok: true, rows, hasMore };
    },
  },
  "auction.broker-grade-thresholds": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const [{ data: brokers, error: brokerError }, { data: grades, error: gradeError }, { data: thresholds, error: thresholdError }] = await Promise.all([
        supabase.from("brokers").select("id, name").order("name"),
        supabase.from("auction_grades").select("id, code").eq("active", true).order("sort_order").order("code"),
        supabase.from("broker_grade_thresholds").select("broker_id, grade_id, min_net_kg, applies"),
      ]);
      const error = brokerError ?? gradeError ?? thresholdError;
      if (error) return { ok: false, error: friendlyError(error) };
      const byPair = new Map(((thresholds ?? []) as { broker_id: string; grade_id: string; min_net_kg: string | number; applies: boolean }[]).map((row) => [`${row.broker_id}:${row.grade_id}`, row]));
      const rows = ((brokers ?? []) as { id: string; name: string }[]).flatMap((broker) =>
        ((grades ?? []) as { id: string; code: string }[]).map((grade) => {
          const threshold = byPair.get(`${broker.id}:${grade.id}`);
          return {
            key: `${broker.id}:${grade.id}`,
            brokerId: broker.id,
            brokerName: broker.name,
            gradeId: grade.id,
            gradeCode: grade.code,
            minNetKg: threshold ? Number(threshold.min_net_kg) : 0,
            applies: threshold?.applies ?? false,
          };
        }),
      );
      return { ok: true, rows };
    },
  },
  "auction.sale-lines": {
    moduleKey: "auction",
    parse: parseSaleParams,
    async load({ supabase, profile }, params) {
      const saleId = params.saleId as string;

      const { data: currentDispatch, error: currentDispatchError } = await supabase
        .from("auction_sales")
        .select("sale_no, target_sale_no")
        .eq("factory_id", profile.factory_id)
        .eq("id", saleId)
        .maybeSingle();
      if (currentDispatchError) return { ok: false, error: friendlyError(currentDispatchError) };
      if (!currentDispatch) return { ok: false, error: "Sale not found." };
      const saleNo = (currentDispatch.target_sale_no as string | null) || (currentDispatch.sale_no as string | null) || saleId;

      const [{ data: allDispatches, error: dispatchError }, { data: allLots, error: lotError }] = await Promise.all([
        supabase
          .from("auction_sales")
          .select("id, sale_no, target_sale_no, brokers(name)")
          .eq("factory_id", profile.factory_id)
          .eq("sale_kind", "dispatch"),
        supabase
          .from("auction_lots")
          .select("id, sale_id, invoice_no, provisional_sale_no, final_sale_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state, reprint_source_lot_id, lot_invoices(invoice_no), marks(code, name)")
          .eq("factory_id", profile.factory_id)
          .order("invoice_no"),
      ]);
      if (dispatchError || lotError) return { ok: false, error: friendlyError(dispatchError ?? lotError) };

      const allLotRows = (allLots ?? []) as unknown as RefreshLotRow[];
      const assignedDispatchIds = new Set(
        allLotRows
          .filter((lot) => saleNoMatches(lot.final_sale_no || lot.provisional_sale_no, saleNo))
          .map((lot) => lot.sale_id),
      );
      const dispatches = (allDispatches ?? []).filter((dispatch) =>
        assignedDispatchIds.has(dispatch.id as string)
        || saleNoMatches(dispatch.target_sale_no as string | null, saleNo)
        || saleNoMatches(dispatch.sale_no as string | null, saleNo),
      );
      const dispatchIds = new Set(dispatches.map((dispatch) => dispatch.id as string));
      const lotRows = allLotRows.filter((lot) => assignedDispatchIds.has(lot.sale_id) || dispatchIds.has(lot.sale_id));
      const lotIds = lotRows.map((lot) => lot.id);
      const [{ data: lines, error: lineError }, { data: reprints, error: reprintError }] = lotIds.length > 0
        ? await Promise.all([
            supabase
              .from("sale_lines")
              .select("lot_id, net_wt, price_per_kg, proceeds, vat_amount, on_guarantee, buyers(name, vat_no)")
              .eq("factory_id", profile.factory_id)
              .in("lot_id", lotIds),
            supabase
              .from("auction_lots")
              .select("reprint_source_lot_id")
              .eq("factory_id", profile.factory_id)
              .in("reprint_source_lot_id", lotIds),
          ])
        : [{ data: [], error: null }, { data: [], error: null }];
      if (lineError || reprintError) return { ok: false, error: friendlyError(lineError ?? reprintError) };

      const dispatchById = new Map((dispatches ?? []).map((dispatch) => [
        dispatch.id as string,
        {
          saleNo: dispatch.sale_no as string | null,
          broker: (dispatch as unknown as { brokers: { name: string } | null }).brokers?.name ?? null,
        },
      ]));
      const lineByLotId = new Map(
        ((lines ?? []) as unknown as RefreshSaleLineRow[])
          .filter((line) => line.lot_id)
          .map((line) => [line.lot_id as string, line]),
      );
      const reprintCountBySource = new Map<string, number>();
      for (const row of (reprints ?? []) as { reprint_source_lot_id: string | null }[]) {
        if (!row.reprint_source_lot_id) continue;
        reprintCountBySource.set(row.reprint_source_lot_id, (reprintCountBySource.get(row.reprint_source_lot_id) ?? 0) + 1);
      }

      return {
        ok: true,
        rows: lotRows.map((lot) => {
          const line = lineByLotId.get(lot.id);
          const dispatch = dispatchById.get(lot.sale_id);
          const invoices = (lot.lot_invoices ?? []).map((invoice) => formatFourDigitNo(invoice.invoice_no)).filter(Boolean);
          const state = stateBucket(lot.state);
          return {
            id: lot.id,
            saleId: lot.sale_id,
            dispatchId: dispatchById.has(lot.sale_id) ? lot.sale_id : null,
            dispatchSaleNo: dispatch?.saleNo ? formatFourDigitNo(dispatch.saleNo) : null,
            broker: dispatch?.broker ?? null,
            mark: lot.marks ? `${lot.marks.code}${lot.marks.name ? ` — ${lot.marks.name}` : ""}` : null,
            lotNo: formatFourDigitNo(lot.lot_no),
            invoiceNo: invoices.length > 0 ? invoices.join(", ") : formatFourDigitNo(lot.invoice_no),
            grade: lot.grade ?? null,
            state: lot.state ?? null,
            stateLabel: state.label,
            stateStyle: state.style,
            buyerName: line?.buyers?.name ?? null,
            buyerVatNo: line?.buyers?.vat_no ?? null,
            bags: lot.bags ?? null,
            kgPerBag: lot.kg_per_bag != null ? Number(lot.kg_per_bag) : null,
            sampleKg: lot.sample_allowance != null ? Number(lot.sample_allowance) : null,
            netWt: Number(line?.net_wt ?? lot.net_wt ?? 0),
            pricePerKg: line?.price_per_kg != null ? Number(line.price_per_kg) : null,
            proceeds: line?.proceeds != null ? Number(line.proceeds) : null,
            vatAmount: line?.vat_amount != null ? Number(line.vat_amount) : null,
            onGuarantee: line?.on_guarantee == null ? null : Boolean(line.on_guarantee),
            reprint: Boolean(lot.reprint_source_lot_id),
            reprintCount: reprintCountBySource.get(lot.id) ?? 0,
          };
        }),
      };
    },
  },
};

/**
 * Resolves one allowlisted read model with fresh auth and tenant scope.
 * Unknown keys and unexpected parameters are rejected before any query runs.
 *
 * Every resource — opted into `search` or not — gets the same
 * generic search-state resolution: the caller's own saved criteria (restored
 * when no explicit search is in flight), merged with any role lock (which
 * always wins), enforced server-side via a row-level filter on the loader's
 * output even when the loader itself can't push filtering into SQL.
 */
export async function loadListResource<Key extends ListResourceKey>(
  request: ListResourceRequest<Key>,
  search?: ListResourceSearch,
): Promise<ListRefreshResult<ListResourceRow<Key>>> {
  const candidate = request as { key?: string; params?: unknown };
  if (!candidate || !isListResourceKey(candidate.key) || !Object.hasOwn(resources, candidate.key)) {
    return { ok: false, error: "Unknown list resource." };
  }
  const definition = resources[candidate.key as ListResourceKey];
  const parsed = definition.parse(candidate.params);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const context = definition.moduleKey
    ? await requireModuleAccess(definition.moduleKey)
    : await requireProfile(ALL_WEB_ROLES);

  // The synthetic search-state resource doesn't itself need restore/merge —
  // it IS the thing that supplies restore/merge to every other resource.
  if (candidate.key === "framework.search-state") {
    return definition.load(context, parsed.value, {
      criteria: {},
      advancedQuery: null,
      page: { offset: 0, limit: DEFAULT_LIST_PAGE_SIZE },
      columns: {},
    }) as Promise<ListRefreshResult<ListResourceRow<Key>>>;
  }

  const listScope = candidate.key;
  const state = await resolveListSearchState(context.supabase, context.profile, listScope);
  const criteria = mergeListCriteria({ saved: state.saved, locked: state.locked, requested: search?.criteria });
  const advancedQuery = search?.advancedQuery ?? state.savedAdvancedQuery ?? null;
  const limit = search?.limit ?? DEFAULT_LIST_PAGE_SIZE;

  const result = await definition.load(context, parsed.value, {
    criteria,
    advancedQuery,
    page: { offset: search?.offset ?? 0, limit },
    columns: definition.search ?? {},
  });
  if (!result.ok) return result as ListRefreshResult<ListResourceRow<Key>>;

  const rows = filterRowsByCriteria(result.rows, criteria);
  return {
    ok: true,
    rows: rows as ListResourceRow<Key>[],
    hasMore: definition.search ? Boolean((result as { hasMore?: boolean }).hasMore) : false,
    savedCriteria: state.saved ?? undefined,
    savedAdvancedQuery: state.savedAdvancedQuery,
    locked: state.locked,
    canManageLocks: state.canManageLocks,
  };
}
