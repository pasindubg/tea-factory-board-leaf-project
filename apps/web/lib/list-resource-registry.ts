import "server-only";

import { friendlyError } from "@/lib/errors";
import type { ListRefreshResult } from "@/lib/list-mutations";
import { isListResourceKey, type ListResourceKey, type ListResourceRequest, type ListResourceRow } from "@/lib/list-resources";
import { parseNoListParams, parsePaymentPeriodParams, parseUuidListParams, parseWeighingListParams } from "@/lib/list-resource-validation";
import { requireModuleAccess } from "@/lib/profile";
import { formatFourDigitNo, formatSaleNo, saleNoMatches } from "@/app/dashboard/auction/sale-number";
import { stateBucket } from "@/app/dashboard/auction/state-buckets";
import { MODULES } from "@/lib/roles";
import { dayRange } from "@/lib/dates";

type AccessContext = Awaited<ReturnType<typeof requireModuleAccess>>;
type ResourceParams = Readonly<Record<string, unknown>>;
type ResourceLoader = (
  context: AccessContext,
  params: ResourceParams,
) => Promise<ListRefreshResult<unknown>>;

type ResourceDefinition = {
  moduleKey: string;
  parse: (input: unknown) => { ok: true; value: ResourceParams } | { ok: false; error: string };
  load: ResourceLoader;
};

const parseNoParams = parseNoListParams;
const parseSaleParams = (input: unknown) => parseUuidListParams(input, "saleId");

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
};

type RefreshDispatchLotRow = RefreshLotRow & {
  shutout_reason: string | null;
  lot_source: string | null;
  marks: { code: string; name: string } | null;
};

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
  "leaf.weighings": {
    moduleKey: "weighings",
    parse: parseWeighingListParams,
    async load({ supabase, profile }, params) {
      let collectorId = params.collectorId as string | undefined;
      if (profile.role === "collector") {
        const { data: ownCollector } = await supabase.from("collectors").select("id").eq("user_id", profile.id).maybeSingle();
        collectorId = ownCollector?.id as string | undefined;
        if (!collectorId) return { ok: true, rows: [] };
      }
      let query = supabase
        .from("weighings")
        .select("id, weight_kg, collected_at, notes, suppliers(name), collectors(name)")
        .order("collected_at", { ascending: false });
      if (typeof params.from === "string") query = query.gte("collected_at", dayRange(params.from).start);
      if (typeof params.to === "string") query = query.lt("collected_at", dayRange(params.to).end);
      if (typeof params.supplierId === "string") query = query.eq("supplier_id", params.supplierId);
      if (collectorId) query = query.eq("collector_id", collectorId);
      const { data, error } = await query;
      if (error) return { ok: false, error: friendlyError(error) };
      return {
        ok: true,
        rows: (data ?? []).map((weighing) => ({
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
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, username, role, active, created_at")
        .order("created_at");
      if (error) return { ok: false, error: friendlyError(error) };
      return {
        ok: true,
        rows: (data ?? []).map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          active: user.active !== false,
        })),
      };
    },
  },
  "users.module-permissions": {
    moduleKey: "users",
    parse: parseNoParams,
    async load({ supabase }) {
      const { data, error } = await supabase.from("module_permissions").select("module_key, allowed_roles");
      if (error) return { ok: false, error: friendlyError(error) };
      const overrides = new Map((data ?? []).map((row) => [row.module_key as string, row.allowed_roles as string[]]));
      return {
        ok: true,
        rows: MODULES.filter((module) => module.key !== "overview").map((module) => ({
          key: module.key,
          label: module.label,
          configurableRoles: module.roles.filter((role) => role !== "owner"),
          allowedRoles: overrides.get(module.key) ?? [...module.roles],
        })),
      };
    },
  },
  "payments.adjustments": {
    moduleKey: "payments",
    parse: parseNoParams,
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("supplier_adjustments")
        .select("id, kind, label, amount, percent, occurred_on, suppliers(name)")
        .order("occurred_on", { ascending: false })
        .limit(50);
      if (error) return { ok: false, error: friendlyError(error) };
      return {
        ok: true,
        rows: (data ?? []).map((adjustment) => ({
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
    async load({ supabase }) {
      const [{ data: suppliers, error }, { data: assignments, error: assignmentError }] = await Promise.all([
        supabase.from("suppliers").select("id, name, area").eq("active", true).order("name"),
        supabase.from("supplier_tiers").select("supplier_id, effective_from, source, quality_tiers(name)").is("effective_to", null),
      ]);
      if (error || assignmentError) return { ok: false, error: friendlyError(error ?? assignmentError) };
      const current = new Map((assignments ?? []).map((assignment) => [assignment.supplier_id as string, assignment]));
      return {
        ok: true,
        rows: (suppliers ?? []).map((supplier) => {
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
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("quality_tiers")
        .select("id, name, bonus_kind, bonus_value, sort_order, active")
        .order("sort_order");
      if (error) return { ok: false, error: friendlyError(error) };
      return {
        ok: true,
        rows: (data ?? []).map((tier) => ({
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
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("price_rates")
        .select("id, price_per_kg, effective_from, effective_to")
        .eq("grade", "GREEN_LEAF")
        .order("effective_from", { ascending: false });
      if (error) return { ok: false, error: friendlyError(error) };
      return {
        ok: true,
        rows: (data ?? []).map((rate) => ({
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
    async load({ supabase }, params) {
      const year = params.year as number;
      const month = params.month as number;
      const { data, error } = await supabase
        .from("payments")
        .select("id, total_kg, gross_amount, deduction_amount, total_amount, status, suppliers(name)")
        .eq("period_year", year)
        .eq("period_month", month)
        .order("created_at");
      if (error) return { ok: false, error: friendlyError(error) };
      return {
        ok: true,
        rows: (data ?? []).map((payment) => ({
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
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("supplier_messages")
        .select("id, title, body, supplier_id, sent_at, suppliers(name)")
        .order("sent_at", { ascending: false })
        .limit(25);
      if (error) return { ok: false, error: friendlyError(error) };
      return {
        ok: true,
        rows: (data ?? []).map((message) => ({
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
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, phone, nic_number, area, land_size_acres, collector_id, active, collectors(name)")
        .order("active", { ascending: false })
        .order("name");
      if (error) return { ok: false, error: friendlyError(error) };
      return {
        ok: true,
        rows: (data ?? []).map((supplier) => ({
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
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("collectors")
        .select("id, name, phone, nic_number, area, active")
        .order("active", { ascending: false })
        .order("name");
      if (error) return { ok: false, error: friendlyError(error) };
      return {
        ok: true,
        rows: (data ?? []).map((collector) => ({
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
    async load({ supabase }) {
      const { data, error } = await supabase.from("brokers").select("id, name, vat_no, address").order("name");
      if (error) return { ok: false, error: friendlyError(error) };
      return { ok: true, rows: data ?? [] };
    },
  },
  "auction.dispatches": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const [{ data: sales, error }, { data: marks, error: markError }, { data: bundles, error: bundleError }] = await Promise.all([
        supabase
          .from("auction_sales")
          .select("id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, status, selling_mark_id, broker_lorry_no, driver_name, bundled_dispatch_id, created_date, brokers(name)")
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
    async load({ supabase }) {
      const { data, error } = await supabase
        .from("auction_bundled_dispatches")
        .select("id, dispatch_no, dispatch_date_from, dispatch_date_to, warehouse, status, auction_bundled_dispatch_invoices(id)")
        .order("dispatch_date_from", { ascending: false })
        .order("dispatch_no", { ascending: false });
      if (error) return { ok: false, error: friendlyError(error) };

      return {
        ok: true,
        rows: ((data ?? []) as unknown as {
          id: string;
          dispatch_no: string;
          dispatch_date_from: string;
          dispatch_date_to: string;
          warehouse: string;
          status: string;
          auction_bundled_dispatch_invoices: { id: string }[] | null;
        }[]).map((dispatch) => ({
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
  "auction.marks": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const { data, error } = await supabase.from("marks").select("id, code, name, address").order("code");
      if (error) return { ok: false, error: friendlyError(error) };
      return { ok: true, rows: data ?? [] };
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
        supabase.from("auction_grades").select("id, code, name, active, sort_order").order("sort_order").order("code"),
        supabase.from("auction_grade_aliases").select("grade_id, alias").order("alias"),
      ]);
      if (error || aliasError) return { ok: false, error: friendlyError(error ?? aliasError) };
      const aliasesByGrade = new Map<string, string[]>();
      for (const alias of (aliases ?? []) as { grade_id: string; alias: string }[]) {
        aliasesByGrade.set(alias.grade_id, [...(aliasesByGrade.get(alias.grade_id) ?? []), alias.alias]);
      }
      return {
        ok: true,
        rows: ((grades ?? []) as { id: string; code: string; name: string; active: boolean; sort_order: number | null }[]).map((grade) => ({
          id: grade.id,
          code: grade.code,
          name: grade.name,
          active: grade.active,
          sortOrder: grade.sort_order ?? 0,
          aliases: aliasesByGrade.get(grade.id) ?? [],
        })),
      };
    },
  },
  "auction.warehouses": {
    moduleKey: "auction",
    parse: parseNoParams,
    async load({ supabase }) {
      const { data, error } = await supabase.from("auction_warehouses").select("id, name, active").order("name");
      if (error) return { ok: false, error: friendlyError(error) };
      return { ok: true, rows: data ?? [] };
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
          .select("id, sale_no, target_sale_no")
          .eq("factory_id", profile.factory_id)
          .eq("sale_kind", "dispatch"),
        supabase
          .from("auction_lots")
          .select("id, sale_id, invoice_no, provisional_sale_no, final_sale_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state, reprint_source_lot_id, lot_invoices(invoice_no)")
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

      const dispatchById = new Map((dispatches ?? []).map((dispatch) => [dispatch.id as string, dispatch.sale_no as string | null]));
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
          const dispatchSaleNo = dispatchById.get(lot.sale_id);
          const invoices = (lot.lot_invoices ?? []).map((invoice) => formatFourDigitNo(invoice.invoice_no)).filter(Boolean);
          const state = stateBucket(lot.state);
          return {
            id: lot.id,
            saleId: lot.sale_id,
            dispatchId: dispatchById.has(lot.sale_id) ? lot.sale_id : null,
            dispatchSaleNo: dispatchSaleNo ? formatFourDigitNo(dispatchSaleNo) : null,
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
 */
export async function loadListResource<Key extends ListResourceKey>(
  request: ListResourceRequest<Key>,
): Promise<ListRefreshResult<ListResourceRow<Key>>> {
  const candidate = request as { key?: string; params?: unknown };
  if (!candidate || !isListResourceKey(candidate.key) || !Object.hasOwn(resources, candidate.key)) {
    return { ok: false, error: "Unknown list resource." };
  }
  const definition = resources[candidate.key as ListResourceKey];
  const parsed = definition.parse(candidate.params);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const context = await requireModuleAccess(definition.moduleKey);
  return definition.load(context, parsed.value) as Promise<ListRefreshResult<ListResourceRow<Key>>>;
}
