"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess, requireModuleRole, requireProfile } from "@/lib/profile";
import { deleteTenantRow } from "@/lib/tenant-data";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { AUC, str, gradeAliasKey, type Supa } from "./_shared";

// ---------- Registry: brokers & marks ----------
export async function createBroker(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const reg = `${AUC}/registry`;
  const name = str(formData.get("name"));
  if (!name) return { ok: false, error: "Broker name is required." };
  const { error } = await supabase.from("brokers").insert({
    factory_id: profile.factory_id,
    name,
    vat_no: str(formData.get("vat_no")) || null,
    address: str(formData.get("address")) || null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(reg);
  return { ok: true, notice: "Broker added.", invalidate: [
    { kind: "exact", resource: { key: "auction.broker-rates" } },
    { kind: "exact", resource: { key: "auction.broker-grade-thresholds" } },
  ] };
}

export async function updateBroker(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const reg = `${AUC}/registry`;
  const name = str(formData.get("name"));
  if (!name) return { ok: false, error: "Broker name is required." };
  const { data: updated, error } = await supabase
    .from("brokers")
    .update({
      name,
      vat_no: str(formData.get("vat_no")) || null,
      address: str(formData.get("address")) || null,
    })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!updated) return { ok: false, error: "This broker was not found or changed before it could be updated." };
  revalidatePath(reg);
  return { ok: true, notice: "Broker updated.", invalidate: [
    { kind: "exact", resource: { key: "auction.broker-rates" } },
    { kind: "exact", resource: { key: "auction.broker-grade-thresholds" } },
  ] };
}

export async function deleteBroker(id: string): Promise<ListMutationResult> {
  const { supabase } = await requireModuleRole("auction", ["owner"]);
  const reg = `${AUC}/registry`;
  const { error } = await deleteTenantRow(supabase, "brokers", id);
  if (error) return { ok: false, error };
  revalidatePath(reg);
  return { ok: true, notice: "Broker deleted.", invalidate: [
    { kind: "exact", resource: { key: "auction.broker-rates" } },
    { kind: "exact", resource: { key: "auction.broker-grade-thresholds" } },
  ] };
}

export async function createMark(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const reg = `${AUC}/registry`;
  const code = str(formData.get("code"));
  const name = str(formData.get("name"));
  if (!code || !name) return { ok: false, error: "Mark code and name are both required." };
  const { error } = await supabase.from("marks").insert({
    factory_id: profile.factory_id,
    code,
    name,
    address: str(formData.get("address")) || null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(reg);
  return { ok: true, notice: "Mark added." };
}

export async function updateMark(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const reg = `${AUC}/registry`;
  const code = str(formData.get("code")).toUpperCase();
  const name = str(formData.get("name"));
  if (!code || !name) return { ok: false, error: "Mark code and name are both required." };
  const { data: updated, error } = await supabase
    .from("marks")
    .update({
      code,
      name,
      address: str(formData.get("address")) || null,
    })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!updated) return { ok: false, error: "This mark was not found or changed before it could be updated." };
  revalidatePath(reg);
  return { ok: true, notice: "Mark updated." };
}

export async function deleteMark(id: string): Promise<ListMutationResult> {
  const { supabase } = await requireModuleRole("auction", ["owner"]);
  const reg = `${AUC}/registry`;
  const { error } = await deleteTenantRow(supabase, "marks", id);
  if (error) return { ok: false, error };
  revalidatePath(reg);
  return { ok: true, notice: "Mark deleted." };
}

// ---------- Broker rate cards (the deduction rates settlements are computed from) ----------
// Owner-editable and effective-dated: confirmContract picks the most recent card
// (by effective_from) for the sale's broker. Without a card, settlements stay empty.
export async function createBrokerRate(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const reg = `${AUC}/registry`;
  const brokerId = str(formData.get("broker_id"));
  const effectiveFrom = str(formData.get("effective_from"));
  if (!brokerId) return { ok: false, error: "Pick a broker for the rate card." };
  if (!effectiveFrom) return { ok: false, error: "Effective-from date is required." };
  // The broker id comes from the client — confirm it's one of this factory's
  // brokers before attaching a rate card to it.
  const { data: broker } = await supabase
    .from("brokers").select("id").eq("id", brokerId).eq("factory_id", profile.factory_id).maybeSingle();
  if (!broker) return { ok: false, error: "Unknown broker." };
  // Parse a numeric field, defaulting to `d` when blank/invalid.
  const rate = (key: string, d = 0): string => {
    const v = Number(str(formData.get(key)));
    return (Number.isFinite(v) ? v : d).toString();
  };
  const { error } = await supabase.from("broker_rates").insert({
    factory_id: profile.factory_id,
    broker_id: brokerId,
    effective_from: effectiveFrom,
    insurance_per_kg: rate("insurance_per_kg"),
    public_sale_ex_per_lot: rate("public_sale_ex_per_lot"),
    brokerage_pct: rate("brokerage_pct"),
    handling_per_kg: rate("handling_per_kg"),
    documentation_per_lot: rate("documentation_per_lot"),
    eplatform_per_kg: rate("eplatform_per_kg"),
    govt_relief_loan: rate("govt_relief_loan"),
    charges_vat_pct: rate("charges_vat_pct", 18),
    proceeds_vat_pct: rate("proceeds_vat_pct", 18),
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(reg);
  return { ok: true, notice: "Broker rate card added." };
}

export async function updateBrokerRate(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const reg = `${AUC}/registry`;
  const brokerId = str(formData.get("broker_id"));
  const effectiveFrom = str(formData.get("effective_from"));
  if (!brokerId) return { ok: false, error: "Pick a broker for the rate card." };
  if (!effectiveFrom) return { ok: false, error: "Effective-from date is required." };
  const { data: broker } = await supabase
    .from("brokers")
    .select("id")
    .eq("id", brokerId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!broker) return { ok: false, error: "Unknown broker." };
  const rate = (key: string, d = 0): string => {
    const v = Number(str(formData.get(key)));
    return (Number.isFinite(v) ? v : d).toString();
  };
  const { data: updated, error } = await supabase
    .from("broker_rates")
    .update({
      broker_id: brokerId,
      effective_from: effectiveFrom,
      insurance_per_kg: rate("insurance_per_kg"),
      public_sale_ex_per_lot: rate("public_sale_ex_per_lot"),
      brokerage_pct: rate("brokerage_pct"),
      handling_per_kg: rate("handling_per_kg"),
      documentation_per_lot: rate("documentation_per_lot"),
      eplatform_per_kg: rate("eplatform_per_kg"),
      govt_relief_loan: rate("govt_relief_loan"),
      charges_vat_pct: rate("charges_vat_pct", 18),
      proceeds_vat_pct: rate("proceeds_vat_pct", 18),
    })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!updated) return { ok: false, error: "This broker rate card was not found or changed before it could be updated." };
  revalidatePath(reg);
  return { ok: true, notice: "Broker rate card updated." };
}

export async function deleteBrokerRate(id: string): Promise<ListMutationResult> {
  const { supabase } = await requireModuleRole("auction", ["owner"]);
  const reg = `${AUC}/registry`;
  const { error } = await deleteTenantRow(supabase, "broker_rates", id);
  if (error) return { ok: false, error };
  revalidatePath(reg);
  return { ok: true, notice: "Broker rate card deleted." };
}

export async function createAuctionGrade(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const settings = `${AUC}/settings`;
  const code = str(formData.get("code")).toUpperCase();
  const name = str(formData.get("name")) || code;
  const sortOrder = Number(str(formData.get("sort_order")) || "0");
  const aliases = parseGradeAliases(formData, code, name);
  if (!code) return { ok: false, error: "Grade code is required." };
  const aliasConflict = await ambiguousGradeAlias(supabase, profile.factory_id, aliases);
  if (aliasConflict) return { ok: false, error: aliasConflict };
  const { data: grade, error } = await supabase.from("auction_grades").insert({
    factory_id: profile.factory_id,
    code,
    name,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    active: true,
  }).select("id").single();
  if (error) return { ok: false, error: friendlyError(error) };
  if (aliases.length > 0 && grade?.id) {
    const { error: aliasError } = await supabase.from("auction_grade_aliases").insert(
      aliases.map((alias) => ({
        factory_id: profile.factory_id,
        grade_id: grade.id,
        alias,
      })),
    );
    if (aliasError) return { ok: false, error: friendlyError(aliasError) };
  }
  revalidatePath(settings);
  return { ok: true, notice: "Tea grade added.", invalidate: [
    { kind: "exact", resource: { key: "auction.broker-grade-thresholds" } },
  ] };
}

export async function updateAuctionGrade(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const settings = `${AUC}/settings`;
  const code = str(formData.get("code")).toUpperCase();
  const name = str(formData.get("name")) || code;
  const sortOrder = Number(str(formData.get("sort_order")) || "0");
  const active = formData.get("active") === "on";
  const aliases = parseGradeAliases(formData, code, name);
  if (!code) return { ok: false, error: "Grade code is required." };

  const { data: existing } = await supabase
    .from("auction_grades")
    .select("code")
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Unknown grade." };
  const aliasConflict = await ambiguousGradeAlias(supabase, profile.factory_id, aliases, id);
  if (aliasConflict) return { ok: false, error: aliasConflict };

  const { data: updated, error } = await supabase
    .from("auction_grades")
    .update({
      code,
      name,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      active,
    })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!updated) return { ok: false, error: "This tea grade changed before it could be updated. Refresh and try again." };

  const oldCode = (existing as { code: string | null }).code;
  if (oldCode && oldCode !== code) {
    const { error: lotError } = await supabase
      .from("auction_lots")
      .update({ grade: code })
      .eq("factory_id", profile.factory_id)
      .eq("grade", oldCode);
    if (lotError) return { ok: false, error: friendlyError(lotError) };
  }

  const { error: deleteAliasesError } = await supabase.from("auction_grade_aliases").delete().eq("grade_id", id).eq("factory_id", profile.factory_id);
  if (deleteAliasesError) return { ok: false, error: friendlyError(deleteAliasesError) };
  if (aliases.length > 0) {
    const { error: aliasError } = await supabase.from("auction_grade_aliases").insert(
      aliases.map((alias) => ({
        factory_id: profile.factory_id,
        grade_id: id,
        alias,
      })),
    );
    if (aliasError) return { ok: false, error: friendlyError(aliasError) };
  }

  revalidatePath(settings);
  revalidatePath(AUC);
  return { ok: true, notice: "Tea grade updated.", invalidate: [
    { kind: "exact", resource: { key: "auction.broker-grade-thresholds" } },
  ] };
}

export async function deleteAuctionGrade(id: string): Promise<ListMutationResult> {
  const { supabase } = await requireModuleRole("auction", ["owner"]);
  const settings = `${AUC}/settings`;
  const { error } = await deleteTenantRow(supabase, "auction_grades", id);
  if (error) return { ok: false, error };
  revalidatePath(settings);
  revalidatePath(AUC);
  return { ok: true, notice: "Tea grade deleted.", invalidate: [
    { kind: "exact", resource: { key: "auction.broker-grade-thresholds" } },
  ] };
}

export async function createAuctionWarehouse(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const warehousesPath = `${AUC}/warehouses`;
  const name = str(formData.get("name"));
  if (!name) return { ok: false, error: "Warehouse name is required." };
  const { error } = await supabase.from("auction_warehouses").insert({
    factory_id: profile.factory_id,
    name,
    active: true,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(warehousesPath);
  return { ok: true, notice: "Warehouse added." };
}

export async function updateAuctionWarehouse(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const warehousesPath = `${AUC}/warehouses`;
  const name = str(formData.get("name"));
  if (!name) return { ok: false, error: "Warehouse name is required." };
  const { data: updated, error } = await supabase
    .from("auction_warehouses")
    .update({ name, active: formData.get("active") === "on" })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!updated) return { ok: false, error: "This warehouse was not found or changed before it could be updated." };
  revalidatePath(warehousesPath);
  return { ok: true, notice: "Warehouse updated." };
}

function parseGradeAliases(formData: FormData, code: string, name: string): string[] {
  const canonical = new Set([gradeAliasKey(code), gradeAliasKey(name)].filter(Boolean));
  return [
    ...new Set(
      str(formData.get("aliases"))
        .split(/[,\n]+/)
        .map((alias) => gradeAliasKey(alias))
        .filter((alias) => alias && !canonical.has(alias)),
    ),
  ];
}

async function ambiguousGradeAlias(
  supabase: Supa,
  factoryId: string,
  aliases: string[],
  currentGradeId?: string,
): Promise<string | null> {
  if (aliases.length === 0) return null;
  const aliasSet = new Set(aliases);
  const { data: grades } = await supabase
    .from("auction_grades")
    .select("id, code, name")
    .eq("factory_id", factoryId);

  for (const grade of (grades ?? []) as { id: string; code: string; name: string }[]) {
    if (grade.id === currentGradeId) continue;
    const conflicting = [grade.code, grade.name].map(gradeAliasKey).find((key) => aliasSet.has(key));
    if (conflicting) return `Alias ${conflicting} already belongs to grade ${grade.code}.`;
  }
  return null;
}

export async function saveBrokerGradeThreshold(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireProfile(["owner"]);
  const settings = `${AUC}/settings`;
  const brokerId = str(formData.get("broker_id"));
  const gradeId = str(formData.get("grade_id"));
  const minNetKg = Number(str(formData.get("min_net_kg")));
  const applies = formData.get("applies") === "on";
  if (!brokerId || !gradeId) return { ok: false, error: "Broker and grade are required." };
  if (!Number.isFinite(minNetKg) || minNetKg < 0) return { ok: false, error: "Minimum kg must be zero or greater." };

  const [{ data: broker }, { data: grade }] = await Promise.all([
    supabase.from("brokers").select("id").eq("id", brokerId).eq("factory_id", profile.factory_id).maybeSingle(),
    supabase.from("auction_grades").select("id").eq("id", gradeId).eq("factory_id", profile.factory_id).maybeSingle(),
  ]);
  if (!broker || !grade) return { ok: false, error: "Unknown broker or grade." };

  const { error } = await supabase.from("broker_grade_thresholds").upsert(
    {
      factory_id: profile.factory_id,
      broker_id: brokerId,
      grade_id: gradeId,
      min_net_kg: minNetKg.toFixed(2),
      applies,
    },
    { onConflict: "factory_id,broker_id,grade_id" },
  );
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(settings);
  return { ok: true, notice: "Threshold updated." };
}
