"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { computeStatement, type AdjustmentInput, type CalcInput } from "@tea/api";
import { requireProfile } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";

const PAY = "/dashboard/payments";
const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const money = (n: number) => n.toFixed(2);
const back = (path: string, error: string) => redirect(`${path}?error=${encodeURIComponent(error)}`);
const ok = (path: string, notice: string) => redirect(`${path}?notice=${encodeURIComponent(notice)}`);

// ---------- Settings: base green-leaf rate ----------
export async function saveBaseRate(formData: FormData) {
  const { supabase, profile } = await requireProfile(MANAGEMENT_ROLES);
  const price = num(formData.get("price_per_kg"));
  const from = str(formData.get("effective_from"));
  const settingsPath = `${PAY}/settings`;
  if (!from || !(price > 0)) back(settingsPath, "A positive rate and an effective-from date are required.");

  // Close the currently-open green-leaf rate the day before the new one starts.
  const dayBefore = new Date(`${from}T00:00:00`);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const closeTo = dayBefore.toISOString().slice(0, 10);
  await supabase
    .from("price_rates")
    .update({ effective_to: closeTo })
    .eq("grade", "GREEN_LEAF")
    .is("effective_to", null);

  const { error } = await supabase.from("price_rates").insert({
    factory_id: profile.factory_id,
    grade: "GREEN_LEAF",
    price_per_kg: money(price),
    effective_from: from,
  });
  if (error) back(settingsPath, error.message);
  revalidatePath(settingsPath);
  ok(settingsPath, `Base rate set to LKR ${money(price)}/kg from ${from}.`);
}

// ---------- Settings: deduction defaults ----------
export async function saveSettings(formData: FormData) {
  const { supabase, profile } = await requireProfile(MANAGEMENT_ROLES);
  const transport = num(formData.get("transport_per_kg"));
  const waterMode = str(formData.get("water_penalty_mode"));
  const waterPct = num(formData.get("default_water_penalty_pct"));
  const waterPerKg = num(formData.get("water_penalty_per_kg"));
  const settingsPath = `${PAY}/settings`;
  if (waterMode !== "per_kg" && waterMode !== "percent") back(settingsPath, "Pick a valid water-penalty mode.");
  if (transport < 0 || waterPct < 0 || waterPct > 100 || waterPerKg < 0) {
    back(settingsPath, "Enter valid non-negative values (water % ≤ 100).");
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
  if (error) back(settingsPath, error.message);
  revalidatePath(settingsPath);
  ok(settingsPath, "Deduction defaults saved.");
}

// ---------- Settings: quality tiers ----------
export async function saveTier(formData: FormData) {
  const { supabase, profile } = await requireProfile(MANAGEMENT_ROLES);
  const id = str(formData.get("id"));
  const name = str(formData.get("name"));
  const bonusKind = str(formData.get("bonus_kind"));
  const bonusValue = num(formData.get("bonus_value"));
  const sortOrder = num(formData.get("sort_order"));
  const settingsPath = `${PAY}/settings`;
  if (!name || (bonusKind !== "flat" && bonusKind !== "percent") || Number.isNaN(bonusValue) || bonusValue < 0) {
    back(settingsPath, "Tier needs a name, a bonus type, and a non-negative bonus value.");
  }
  const row = {
    factory_id: profile.factory_id,
    name,
    bonus_kind: bonusKind,
    bonus_value: money(bonusValue),
    sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
  };
  const { error } = id
    ? await supabase.from("quality_tiers").update(row).eq("id", id)
    : await supabase.from("quality_tiers").insert(row);
  if (error) back(settingsPath, error.message);
  revalidatePath(settingsPath);
  ok(settingsPath, id ? `Tier "${name}" updated.` : `Tier "${name}" added.`);
}

export async function setTierActive(formData: FormData) {
  const { supabase } = await requireProfile(MANAGEMENT_ROLES);
  const id = str(formData.get("id"));
  const active = str(formData.get("active")) === "true";
  const settingsPath = `${PAY}/settings`;
  const { error } = await supabase.from("quality_tiers").update({ active }).eq("id", id);
  if (error) back(settingsPath, error.message);
  revalidatePath(settingsPath);
  ok(settingsPath, active ? "Tier reactivated." : "Tier deactivated.");
}

// ---------- Supplier tier assignment ----------
export async function assignTier(formData: FormData) {
  const { supabase, profile } = await requireProfile(MANAGEMENT_ROLES);
  const supplierId = str(formData.get("supplier_id"));
  const tierId = str(formData.get("tier_id"));
  const from = str(formData.get("effective_from"));
  const note = str(formData.get("note")) || null;
  const tiersPath = `${PAY}/tiers`;
  if (!supplierId || !tierId || !from) back(tiersPath, "Supplier, tier, and effective-from are required.");

  // Close the supplier's current open assignment the day before the new one.
  const dayBefore = new Date(`${from}T00:00:00`);
  dayBefore.setDate(dayBefore.getDate() - 1);
  await supabase
    .from("supplier_tiers")
    .update({ effective_to: dayBefore.toISOString().slice(0, 10) })
    .eq("supplier_id", supplierId)
    .is("effective_to", null);

  const { error } = await supabase.from("supplier_tiers").insert({
    factory_id: profile.factory_id,
    supplier_id: supplierId,
    tier_id: tierId,
    source: "manual",
    effective_from: from,
    note,
    assigned_by: profile.id,
  });
  if (error) back(tiersPath, error.message);
  revalidatePath(tiersPath);
  ok(tiersPath, "Tier assigned. Go to Payments and click Regenerate to apply it to the statement.");
}

// ---------- Adjustments (advances / deductions) ----------
export async function addAdjustment(formData: FormData) {
  const { supabase, profile } = await requireProfile(MANAGEMENT_ROLES);
  const supplierId = str(formData.get("supplier_id"));
  const kind = str(formData.get("kind"));
  const label = str(formData.get("label")) || null;
  const mode = str(formData.get("mode")); // "amount" | "percent"
  const value = num(formData.get("value"));
  const occurredOn = str(formData.get("occurred_on"));
  const adjPath = `${PAY}/adjustments`;
  const kinds = ["advance", "transport", "water_penalty", "other", "bonus"];
  if (!supplierId || !kinds.includes(kind) || !occurredOn || Number.isNaN(value) || value <= 0) {
    back(adjPath, "Supplier, kind, date, and a positive value are required.");
  }
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
  if (error) back(adjPath, error.message);
  revalidatePath(adjPath);
  ok(adjPath, "Adjustment added. Go to Payments and click Regenerate to apply it to the statement.");
}

export async function deleteAdjustment(formData: FormData) {
  const { supabase } = await requireProfile(MANAGEMENT_ROLES);
  const id = str(formData.get("id"));
  const adjPath = `${PAY}/adjustments`;
  const { error } = await supabase.from("supplier_adjustments").delete().eq("id", id);
  if (error) back(adjPath, error.message);
  revalidatePath(adjPath);
  ok(adjPath, "Adjustment removed. Regenerate the statement on the Payments page to reflect the change.");
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

export async function generatePayments(formData: FormData) {
  const { supabase, profile } = await requireProfile(MANAGEMENT_ROLES);
  const year = num(formData.get("year"));
  const month = num(formData.get("month"));
  if (!year || !month || month < 1 || month > 12) back(PAY, "Pick a valid month to generate.");

  const startISO = new Date(year, month - 1, 1).toISOString();
  const endISO = new Date(year, month, 1).toISOString();

  const [weighRes, ratesRes, tiersRes, assignRes, adjRes, settingsRes, existingRes] = await Promise.all([
    supabase.from("weighings").select("supplier_id, weight_kg, collected_at, water_penalty, transport_applies").gte("collected_at", startISO).lt("collected_at", endISO),
    supabase.from("price_rates").select("price_per_kg, effective_from, effective_to").eq("grade", "GREEN_LEAF"),
    supabase.from("quality_tiers").select("id, name, bonus_kind, bonus_value, sort_order").eq("active", true),
    supabase.from("supplier_tiers").select("supplier_id, tier_id, effective_from, effective_to"),
    supabase.from("supplier_adjustments").select("supplier_id, kind, label, amount, percent, period_year, period_month, occurred_on"),
    supabase.from("payment_settings").select("transport_per_kg, water_penalty_mode, water_penalty_per_kg, default_water_penalty_pct").eq("factory_id", profile.factory_id).maybeSingle(),
    supabase.from("payments").select("id, supplier_id, status").eq("period_year", year).eq("period_month", month),
  ]);

  if (adjRes.error) back(PAY, `Could not load adjustments: ${adjRes.error.message}`);

  const weighings = (weighRes.data ?? []) as WeighRow[];
  if (weighings.length === 0) back(PAY, `No weighings found for ${year}-${String(month).padStart(2, "0")}.`);

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
    if (existing) await supabase.from("payments").delete().eq("id", existing.id); // lines cascade

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
    if (payErr) back(PAY, payErr.message);

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
      if (lineErr) back(PAY, lineErr.message);
    }
    generated++;
  }

  revalidatePath(PAY);
  ok(
    `${PAY}?year=${year}&month=${month}`,
    `Generated ${generated} statement(s) for ${year}-${String(month).padStart(2, "0")}` +
      (skippedPaid ? `; skipped ${skippedPaid} already-paid.` : "."),
  );
}

export async function setPaymentStatus(formData: FormData) {
  const { supabase } = await requireProfile(MANAGEMENT_ROLES);
  const id = str(formData.get("payment_id"));
  const paid = str(formData.get("paid")) === "true";
  const returnTo = str(formData.get("return_to")) || PAY;
  const { error } = await supabase
    .from("payments")
    .update({ status: paid ? "paid" : "pending", paid_at: paid ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) back(returnTo, error.message);
  revalidatePath(returnTo);
  revalidatePath(PAY);
  ok(returnTo, paid ? "Marked paid." : "Marked pending.");
}
