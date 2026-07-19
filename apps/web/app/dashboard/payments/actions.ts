"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { computeStatement, type AdjustmentInput, type CalcInput } from "@tea/api";
import { requireModuleRole } from "@/lib/profile";
import { deleteTenantRow } from "@/lib/tenant-data";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";

const PAY = "/dashboard/payments";
const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const money = (n: number) => n.toFixed(2);
const selectedIds = (formData: FormData, fallbackName?: string) => {
  const ids = formData.getAll("selected_ids").map(String).filter(Boolean);
  if (ids.length === 0 && fallbackName) {
    const fallback = str(formData.get(fallbackName));
    if (fallback) ids.push(fallback);
  }
  return [...new Set(ids)];
};

// ---------- Settings: base green-leaf rate ----------
export async function saveBaseRate(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleRole("payments", MANAGEMENT_ROLES);
  const price = num(formData.get("price_per_kg"));
  const from = str(formData.get("effective_from"));
  const settingsPath = `${PAY}/settings`;
  if (!from || !(price > 0)) return { ok: false, error: "A positive rate and an effective-from date are required." };

  // Close the currently-open green-leaf rate the day before the new one starts.
  const dayBefore = new Date(`${from}T00:00:00`);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const closeTo = dayBefore.toISOString().slice(0, 10);
  const { error: closeError } = await supabase
    .from("price_rates")
    .update({ effective_to: closeTo })
    .eq("grade", "GREEN_LEAF")
    .eq("factory_id", profile.factory_id)
    .is("effective_to", null);
  if (closeError) return { ok: false, error: friendlyError(closeError) };

  const { error } = await supabase.from("price_rates").insert({
    factory_id: profile.factory_id,
    grade: "GREEN_LEAF",
    price_per_kg: money(price),
    effective_from: from,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(settingsPath);
  return {
    ok: true,
    notice: `Base rate set to LKR ${money(price)}/kg from ${from}.`,
    invalidate: [{ kind: "all", key: "payments.statements" }],
  };
}

// ---------- Settings: deduction defaults ----------
export async function saveSettings(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleRole("payments", MANAGEMENT_ROLES);
  const transport = num(formData.get("transport_per_kg"));
  const waterMode = str(formData.get("water_penalty_mode"));
  const waterPct = num(formData.get("default_water_penalty_pct"));
  const waterPerKg = num(formData.get("water_penalty_per_kg"));
  const settingsPath = `${PAY}/settings`;
  if (waterMode !== "per_kg" && waterMode !== "percent") return { ok: false, error: "Pick a valid water-penalty mode." };
  if (![transport, waterPct, waterPerKg].every(Number.isFinite) || transport < 0 || waterPct < 0 || waterPct > 100 || waterPerKg < 0) {
    return { ok: false, error: "Enter valid non-negative values (water % ≤ 100)." };
  }

  const { error } = await supabase.from("payment_settings").upsert(
    {
      factory_id: profile.factory_id,
      transport_per_kg: money(transport),
      water_penalty_mode: waterMode,
      water_penalty_per_kg: money(waterPerKg),
      default_water_penalty_pct: money(waterPct),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "factory_id" },
  );
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(settingsPath);
  return { ok: true, notice: "Deduction defaults saved.", invalidate: [{ kind: "all", key: "payments.statements" }] };
}

// ---------- Settings: quality tiers ----------
export async function saveTier(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleRole("payments", ["owner"]);
  const id = str(formData.get("id"));
  const name = str(formData.get("name"));
  const bonusKind = str(formData.get("bonus_kind"));
  const bonusValue = num(formData.get("bonus_value"));
  const sortOrder = num(formData.get("sort_order"));
  const settingsPath = `${PAY}/settings`;
  if (!name || (bonusKind !== "flat" && bonusKind !== "percent") || Number.isNaN(bonusValue) || bonusValue < 0) {
    return { ok: false, error: "Tier needs a name, a bonus type, and a non-negative bonus value." };
  }
  const row = {
    factory_id: profile.factory_id,
    name,
    bonus_kind: bonusKind,
    bonus_value: money(bonusValue),
    sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
  };
  if (id) {
    const { data, error } = await supabase
      .from("quality_tiers")
      .update(row)
      .eq("id", id)
      .eq("factory_id", profile.factory_id)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: friendlyError(error) };
    if (!data) return { ok: false, error: "The selected quality tier is no longer available." };
  } else {
    const { error } = await supabase.from("quality_tiers").insert(row);
    if (error) return { ok: false, error: friendlyError(error) };
  }
  revalidatePath(settingsPath);
  return {
    ok: true,
    notice: id ? `Tier "${name}" updated.` : `Tier "${name}" added.`,
    invalidate: [
      { kind: "exact", resource: { key: "payments.tier-assignments" } },
      { kind: "all", key: "payments.statements" },
    ],
  };
}

export async function setTierActive(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleRole("payments", ["owner"]);
  const ids = selectedIds(formData, "id");
  const activeValue = str(formData.get("active"));
  const active = activeValue === "true";
  const settingsPath = `${PAY}/settings`;
  if (ids.length === 0) return { ok: false, error: "Select at least one quality tier." };
  if (activeValue !== "true" && activeValue !== "false") return { ok: false, error: "Choose a valid tier status." };

  const { data: existing, error: readError } = await supabase
    .from("quality_tiers")
    .select("id")
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (readError) return { ok: false, error: friendlyError(readError) };
  if ((existing ?? []).length !== ids.length) {
    return { ok: false, error: "One or more selected quality tiers are no longer available." };
  }

  const { error } = await supabase
    .from("quality_tiers")
    .update({ active })
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(settingsPath);
  return {
    ok: true,
    notice: `${ids.length} quality tier${ids.length === 1 ? "" : "s"} ${active ? "reactivated" : "deactivated"}.`,
    invalidate: [
      { kind: "exact", resource: { key: "payments.tier-assignments" } },
      { kind: "all", key: "payments.statements" },
    ],
  };
}

// ---------- Supplier tier assignment ----------
export async function assignTier(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleRole("payments", MANAGEMENT_ROLES);
  const supplierId = str(formData.get("supplier_id"));
  const tierId = str(formData.get("tier_id"));
  const from = str(formData.get("effective_from"));
  const note = str(formData.get("note")) || null;
  const tiersPath = `${PAY}/tiers`;
  if (!supplierId || !tierId || !from) return { ok: false, error: "Supplier, tier, and effective-from are required." };
  const [{ data: supplier }, { data: tier }] = await Promise.all([
    supabase.from("suppliers").select("id").eq("id", supplierId).eq("factory_id", profile.factory_id).eq("active", true).maybeSingle(),
    supabase.from("quality_tiers").select("id").eq("id", tierId).eq("factory_id", profile.factory_id).eq("active", true).maybeSingle(),
  ]);
  if (!supplier || !tier) return { ok: false, error: "The selected supplier or tier is unavailable." };

  // Close the supplier's current open assignment the day before the new one.
  const dayBefore = new Date(`${from}T00:00:00`);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const { error: closeError } = await supabase
    .from("supplier_tiers")
    .update({ effective_to: dayBefore.toISOString().slice(0, 10) })
    .eq("supplier_id", supplierId)
    .eq("factory_id", profile.factory_id)
    .is("effective_to", null);
  if (closeError) return { ok: false, error: friendlyError(closeError) };

  const { error } = await supabase.from("supplier_tiers").insert({
    factory_id: profile.factory_id,
    supplier_id: supplierId,
    tier_id: tierId,
    source: "manual",
    effective_from: from,
    note,
    assigned_by: profile.id,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(tiersPath);
  return {
    ok: true,
    notice: "Tier assigned. Regenerate the relevant payment period to apply it.",
    invalidate: [{ kind: "all", key: "payments.statements" }],
  };
}

// ---------- Adjustments (advances / deductions) ----------
export async function addAdjustment(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleRole("payments", MANAGEMENT_ROLES);
  const supplierId = str(formData.get("supplier_id"));
  const kind = str(formData.get("kind"));
  const label = str(formData.get("label")) || null;
  const mode = str(formData.get("mode")); // "amount" | "percent"
  const value = num(formData.get("value"));
  const occurredOn = str(formData.get("occurred_on"));
  const adjPath = `${PAY}/adjustments`;
  const kinds = ["advance", "transport", "water_penalty", "other", "bonus"];
  if (!supplierId || !kinds.includes(kind) || !occurredOn || Number.isNaN(value) || value <= 0) {
    return { ok: false, error: "Supplier, kind, date, and a positive value are required." };
  }
  const { data: supplier } = await supabase.from("suppliers").select("id").eq("id", supplierId).eq("factory_id", profile.factory_id).maybeSingle();
  if (!supplier) return { ok: false, error: "The selected supplier is unavailable." };
  const isPercent = mode === "percent";
  const d = new Date(`${occurredOn}T00:00:00`);
  const { error } = await supabase.from("supplier_adjustments").insert({
    factory_id: profile.factory_id,
    supplier_id: supplierId,
    kind,
    label,
    amount: isPercent ? null : money(value),
    percent: isPercent ? value.toFixed(2) : null,
    occurred_on: occurredOn,
    period_year: d.getFullYear(),
    period_month: d.getMonth() + 1,
    created_by: profile.id,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(adjPath);
  return {
    ok: true,
    notice: "Adjustment added. Regenerate the relevant payment period to apply it.",
    invalidate: [{ kind: "all", key: "payments.statements" }],
  };
}

export async function deleteAdjustment(formData: FormData): Promise<ListMutationResult> {
  const { supabase } = await requireModuleRole("payments", MANAGEMENT_ROLES);
  const id = str(formData.get("id"));
  const adjPath = `${PAY}/adjustments`;
  if (!id) return { ok: false, error: "Select an adjustment." };
  const { error } = await deleteTenantRow(supabase, "supplier_adjustments", id);
  if (error) return { ok: false, error };
  revalidatePath(adjPath);
  return {
    ok: true,
    notice: "Adjustment removed. Regenerate the relevant statement to reflect the change.",
    invalidate: [{ kind: "all", key: "payments.statements" }],
  };
}

// ---------- Generate a month's payments ----------
type RateRow = { price_per_kg: string; effective_from: string; effective_to: string | null };
type TierRow = { id: string; name: string; bonus_kind: "flat" | "percent"; bonus_value: string; sort_order: number };
type AssignRow = { supplier_id: string; tier_id: string; effective_from: string; effective_to: string | null };
type AdjRow = {
  supplier_id: string;
  kind: AdjustmentInput["kind"];
  label: string | null;
  amount: string | null;
  percent: string | null;
  period_year: number | null;
  period_month: number | null;
  occurred_on: string;
};
type WeighRow = {
  supplier_id: string;
  weight_kg: string;
  collected_at: string;
  water_penalty: boolean | null;
  transport_applies: boolean | null;
};

export async function generatePayments(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleRole("payments", MANAGEMENT_ROLES);
  const year = num(formData.get("year"));
  const month = num(formData.get("month"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: "Pick a valid month to generate." };
  }

  const startISO = new Date(year, month - 1, 1).toISOString();
  const endISO = new Date(year, month, 1).toISOString();

  const [weighRes, ratesRes, tiersRes, assignRes, adjRes, settingsRes, existingRes] = await Promise.all([
    supabase.from("weighings").select("supplier_id, weight_kg, collected_at, water_penalty, transport_applies").eq("factory_id", profile.factory_id).gte("collected_at", startISO).lt("collected_at", endISO),
    supabase.from("price_rates").select("price_per_kg, effective_from, effective_to").eq("factory_id", profile.factory_id).eq("grade", "GREEN_LEAF"),
    supabase.from("quality_tiers").select("id, name, bonus_kind, bonus_value, sort_order").eq("factory_id", profile.factory_id).eq("active", true),
    supabase.from("supplier_tiers").select("supplier_id, tier_id, effective_from, effective_to").eq("factory_id", profile.factory_id),
    supabase.from("supplier_adjustments").select("supplier_id, kind, label, amount, percent, period_year, period_month, occurred_on").eq("factory_id", profile.factory_id),
    supabase.from("payment_settings").select("transport_per_kg, water_penalty_mode, water_penalty_per_kg, default_water_penalty_pct").eq("factory_id", profile.factory_id).maybeSingle(),
    supabase.from("payments").select("id, supplier_id, status").eq("factory_id", profile.factory_id).eq("period_year", year).eq("period_month", month),
  ]);

  const sourceError = [
    weighRes.error,
    ratesRes.error,
    tiersRes.error,
    assignRes.error,
    adjRes.error,
    settingsRes.error,
    existingRes.error,
  ].find(Boolean);
  if (sourceError) return { ok: false, error: friendlyError(sourceError) };

  const weighings = (weighRes.data ?? []) as WeighRow[];
  if (weighings.length === 0) {
    return { ok: false, error: `No weighings found for ${year}-${String(month).padStart(2, "0")}.` };
  }

  const baseRates = (ratesRes.data as RateRow[] ?? []).map((r) => ({
    pricePerKg: Number(r.price_per_kg),
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
  }));
  const tiers = (tiersRes.data as TierRow[] ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    bonusKind: t.bonus_kind,
    bonusValue: Number(t.bonus_value),
    sortOrder: t.sort_order,
  }));
  const settings = settingsRes.data as {
    transport_per_kg: string;
    water_penalty_mode: "per_kg" | "percent";
    water_penalty_per_kg: string;
    default_water_penalty_pct: string;
  } | null;
  const transportPerKg = Number(settings?.transport_per_kg ?? 0);
  const waterPenalty = {
    mode: settings?.water_penalty_mode ?? "percent",
    perKg: Number(settings?.water_penalty_per_kg ?? 0),
    pct: Number(settings?.default_water_penalty_pct ?? 0),
  } as const;

  const assignBySupplier = new Map<string, AssignRow[]>();
  for (const a of (assignRes.data as AssignRow[] ?? [])) {
    (assignBySupplier.get(a.supplier_id) ?? assignBySupplier.set(a.supplier_id, []).get(a.supplier_id)!).push(a);
  }
  const adjBySupplier = new Map<string, AdjRow[]>();
  for (const a of (adjRes.data as AdjRow[] ?? [])) {
    const inPeriod =
      a.period_year != null && a.period_month != null
        ? Number(a.period_year) === year && Number(a.period_month) === month
        : a.occurred_on >= startISO.slice(0, 10) && a.occurred_on < endISO.slice(0, 10);
    if (!inPeriod) continue;
    // Skip water-penalty adjustments — per-delivery water penalties are
    // computed from weighing.water_penalty flags; manual ones would double-count.
    if (a.kind === "water_penalty") continue;
    (adjBySupplier.get(a.supplier_id) ?? adjBySupplier.set(a.supplier_id, []).get(a.supplier_id)!).push(a);
  }
  const weighBySupplier = new Map<string, WeighRow[]>();
  for (const w of weighings) {
    (weighBySupplier.get(w.supplier_id) ?? weighBySupplier.set(w.supplier_id, []).get(w.supplier_id)!).push(w);
  }
  const existingBySupplier = new Map(
    ((existingRes.data ?? []) as { id: string; supplier_id: string; status: string }[]).map((p) => [p.supplier_id, p]),
  );

  let generated = 0;
  let skippedPaid = 0;

  for (const [supplierId, supplierWeighings] of weighBySupplier) {
    const existing = existingBySupplier.get(supplierId);
    if (existing && existing.status === "paid") {
      skippedPaid++;
      continue;
    }
    if (existing) {
      const { error } = await supabase
        .from("payments")
        .delete()
        .eq("id", existing.id)
        .eq("factory_id", profile.factory_id); // payment lines cascade
      if (error) return { ok: false, error: friendlyError(error) };
    }

    const input: CalcInput = {
      weighings: supplierWeighings.map((w) => ({
        weightKg: Number(w.weight_kg),
        collectedAt: w.collected_at,
        waterPenalty: w.water_penalty === true,
        transportApplies: w.transport_applies !== false,
      })),
      baseRates,
      tiers,
      assignments: (assignBySupplier.get(supplierId) ?? []).map((a) => ({
        tierId: a.tier_id,
        effectiveFrom: a.effective_from,
        effectiveTo: a.effective_to,
      })),
      adjustments: (adjBySupplier.get(supplierId) ?? []).map((a) => ({
        kind: a.kind,
        label: a.label,
        amount: a.amount != null ? Number(a.amount) : null,
        percent: a.percent != null ? Number(a.percent) : null,
      })),
      transportPerKg,
      waterPenalty,
    };
    const s = computeStatement(input);

    const paymentId = randomUUID();
    const { error: payErr } = await supabase.from("payments").insert({
      id: paymentId,
      factory_id: profile.factory_id,
      supplier_id: supplierId,
      period_year: year,
      period_month: month,
      total_kg: money(s.totalKg),
      gross_amount: money(s.grossAmount),
      bonus_amount: money(s.bonusAmount),
      bonus_missed: money(s.bonusMissed),
      deduction_amount: money(s.deductionAmount),
      total_amount: money(s.netAmount),
      status: "pending",
      generated_at: new Date().toISOString(),
    });
    if (payErr) return { ok: false, error: friendlyError(payErr) };

    if (s.lines.length > 0) {
      const { error: lineErr } = await supabase.from("payment_lines").insert(
        s.lines.map((l) => ({
          payment_id: paymentId,
          factory_id: profile.factory_id,
          line_type: l.lineType,
          label: l.label,
          quantity: l.quantity != null ? money(l.quantity) : null,
          rate: l.rate != null ? money(l.rate) : null,
          amount: money(l.amount),
          sort_order: l.sortOrder,
        })),
      );
      if (lineErr) {
        await supabase
          .from("payments")
          .delete()
          .eq("id", paymentId)
          .eq("factory_id", profile.factory_id);
        return { ok: false, error: friendlyError(lineErr) };
      }
    }
    generated++;
  }

  revalidatePath(PAY);
  return {
    ok: true,
    notice:
      `Generated ${generated} statement${generated === 1 ? "" : "s"} for ${year}-${String(month).padStart(2, "0")}` +
      (skippedPaid ? `; skipped ${skippedPaid} already-paid.` : "."),
  };
}

export async function setPaymentStatus(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleRole("payments", MANAGEMENT_ROLES);
  const ids = selectedIds(formData, "payment_id");
  const paidValue = str(formData.get("paid"));
  const paid = paidValue === "true";
  if (ids.length === 0) return { ok: false, error: "Select at least one payment statement." };
  if (paidValue !== "true" && paidValue !== "false") return { ok: false, error: "Choose a valid statement status." };

  const { data: existing, error: readError } = await supabase
    .from("payments")
    .select("id")
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (readError) return { ok: false, error: friendlyError(readError) };
  if ((existing ?? []).length !== ids.length) {
    return { ok: false, error: "One or more selected statements are no longer available." };
  }

  const { error } = await supabase
    .from("payments")
    .update({ status: paid ? "paid" : "pending", paid_at: paid ? new Date().toISOString() : null })
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(PAY);
  for (const id of ids) revalidatePath(`${PAY}/${id}`);
  return {
    ok: true,
    notice: `${ids.length} statement${ids.length === 1 ? "" : "s"} marked ${paid ? "paid" : "pending"}.`,
  };
}
