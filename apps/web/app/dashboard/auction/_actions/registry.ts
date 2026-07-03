"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { AUC, roles, str, back } from "./_shared";

// ---------- Registry: brokers & marks ----------
export async function createBroker(formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
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
  const { supabase, profile } = await requireProfile(roles());
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
