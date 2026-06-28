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
