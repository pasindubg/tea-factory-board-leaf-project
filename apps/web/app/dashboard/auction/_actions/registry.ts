"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModuleAccess, requireProfile } from "@/lib/profile";
import { AUC, str, back } from "./_shared";

// ---------- Registry: brokers & marks ----------
export async function createBroker(formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const reg = `${AUC}/registry`;
  const name = str(formData.get("name"));
  if (!name) back(reg, "Broker name is required.");
  const { error } = await supabase.from("brokers").insert({
    factory_id: profile.factory_id,
    name,
    vat_no: str(formData.get("vat_no")) || null,
    address: str(formData.get("address")) || null,
  });
  if (error) back(reg, error.message);
  revalidatePath(reg);
  redirect(reg);
}

export async function createMark(formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const reg = `${AUC}/registry`;
  const code = str(formData.get("code"));
  const name = str(formData.get("name"));
  if (!code || !name) back(reg, "Mark code and name are both required.");
  const { error } = await supabase.from("marks").insert({
    factory_id: profile.factory_id,
    code,
    name,
    address: str(formData.get("address")) || null,
  });
  if (error) back(reg, error.message);
  revalidatePath(reg);
  redirect(reg);
}

// ---------- Broker rate cards (the deduction rates settlements are computed from) ----------
// Owner-editable and effective-dated: confirmContract picks the most recent card
// (by effective_from) for the sale's broker. Without a card, settlements stay empty.
export async function createBrokerRate(formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);
  const reg = `${AUC}/registry`;
  const brokerId = str(formData.get("broker_id"));
  const effectiveFrom = str(formData.get("effective_from"));
  if (!brokerId) back(reg, "Pick a broker for the rate card.");
  if (!effectiveFrom) back(reg, "Effective-from date is required.");
  // The broker id comes from the client — confirm it's one of this factory's
  // brokers before attaching a rate card to it.
  const { data: broker } = await supabase
    .from("brokers").select("id").eq("id", brokerId).eq("factory_id", profile.factory_id).maybeSingle();
  if (!broker) back(reg, "Unknown broker.");
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
  if (error) back(reg, error.message);
  revalidatePath(reg);
  redirect(reg);
}

export async function createAuctionGrade(formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);
  const settings = `${AUC}/settings`;
  const code = str(formData.get("code")).toUpperCase();
  const name = str(formData.get("name")) || code;
  const sortOrder = Number(str(formData.get("sort_order")) || "0");
  if (!code) back(settings, "Grade code is required.");
  const { error } = await supabase.from("auction_grades").insert({
    factory_id: profile.factory_id,
    code,
    name,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    active: true,
  });
  if (error) back(settings, error.message);
  revalidatePath(settings);
  redirect(settings);
}

export async function saveBrokerGradeThreshold(formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);
  const settings = `${AUC}/settings`;
  const brokerId = str(formData.get("broker_id"));
  const gradeId = str(formData.get("grade_id"));
  const minNetKg = Number(str(formData.get("min_net_kg")));
  const applies = formData.get("applies") === "on";
  if (!brokerId || !gradeId) back(settings, "Broker and grade are required.");
  if (!Number.isFinite(minNetKg) || minNetKg < 0) back(settings, "Minimum kg must be zero or greater.");

  const [{ data: broker }, { data: grade }] = await Promise.all([
    supabase.from("brokers").select("id").eq("id", brokerId).eq("factory_id", profile.factory_id).maybeSingle(),
    supabase.from("auction_grades").select("id").eq("id", gradeId).eq("factory_id", profile.factory_id).maybeSingle(),
  ]);
  if (!broker || !grade) back(settings, "Unknown broker or grade.");

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
  if (error) back(settings, error.message);
  revalidatePath(settings);
  redirect(settings);
}
