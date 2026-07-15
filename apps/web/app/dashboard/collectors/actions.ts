"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { ListInvalidation } from "@/lib/list-resources";
import { requireModuleAccess } from "@/lib/profile";

const COLLECTORS_PATH = "/dashboard/collectors";
const SUPPLIERS_PATH = "/dashboard/suppliers";

function supplierInvalidation(): ListInvalidation[] {
  return [{ kind: "exact", resource: { key: "leaf.suppliers" } }];
}

function collectorFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    nic_number: String(formData.get("nic_number") ?? "").trim() || null,
    area: String(formData.get("area") ?? "").trim() || null,
  };
}

export async function createCollector(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("collectors");
  const fields = collectorFields(formData);
  if (!fields.name) return { ok: false, error: "Collector name is required." };

  const { error } = await supabase.from("collectors").insert({ factory_id: profile.factory_id, ...fields });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(COLLECTORS_PATH);
  revalidatePath(SUPPLIERS_PATH);
  return { ok: true, notice: "Collector added.", invalidate: supplierInvalidation() };
}

export async function updateCollector(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("collectors");
  const fields = collectorFields(formData);
  if (!id) return { ok: false, error: "Collector id is required." };
  if (!fields.name) return { ok: false, error: "Collector name is required." };

  const { data, error } = await supabase
    .from("collectors")
    .update(fields)
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: "Collector not found." };

  revalidatePath(COLLECTORS_PATH);
  revalidatePath(SUPPLIERS_PATH);
  return { ok: true, notice: "Collector updated.", invalidate: supplierInvalidation() };
}

function selectedIds(formData: FormData) {
  return [...new Set(formData.getAll("selected_ids").map(String).filter(Boolean))];
}

export async function setSelectedCollectorsActive(active: boolean, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("collectors");
  const ids = selectedIds(formData);
  if (ids.length === 0) return { ok: false, error: "Select at least one collector." };

  const { data: existing, error: readError } = await supabase
    .from("collectors")
    .select("id")
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (readError) return { ok: false, error: friendlyError(readError) };
  if ((existing ?? []).length !== ids.length) {
    return { ok: false, error: "One or more selected collectors are no longer available." };
  }

  const { error } = await supabase
    .from("collectors")
    .update({ active })
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(COLLECTORS_PATH);
  revalidatePath(SUPPLIERS_PATH);
  return {
    ok: true,
    notice: `${ids.length} collector${ids.length === 1 ? "" : "s"} ${active ? "reactivated" : "deactivated"}.`,
    invalidate: supplierInvalidation(),
  };
}
