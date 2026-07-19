"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { requireModuleAccess } from "@/lib/profile";

const SUPPLIERS_PATH = "/dashboard/suppliers";

function supplierFields(formData: FormData) {
  const landSize = String(formData.get("land_size_acres") ?? "").trim();
  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    nic_number: String(formData.get("nic_number") ?? "").trim() || null,
    area: String(formData.get("area") ?? "").trim() || null,
    land_size_acres: landSize ? landSize : null,
    collector_id: String(formData.get("collector_id") ?? "").trim() || null,
  };
}

async function collectorBelongsToFactory(
  supabase: Awaited<ReturnType<typeof requireModuleAccess>>["supabase"],
  factoryId: string,
  collectorId: string | null,
): Promise<ListMutationResult | null> {
  if (!collectorId) return null;
  const { data, error } = await supabase
    .from("collectors")
    .select("id")
    .eq("id", collectorId)
    .eq("factory_id", factoryId)
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  return data ? null : { ok: false, error: "The selected collector is not available for this factory." };
}

export async function createSupplier(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("suppliers");
  const fields = supplierFields(formData);
  if (!fields.name) return { ok: false, error: "Supplier name is required." };
  if (fields.land_size_acres != null && (!Number.isFinite(Number(fields.land_size_acres)) || Number(fields.land_size_acres) < 0)) {
    return { ok: false, error: "Land size must be zero or greater." };
  }
  const collectorError = await collectorBelongsToFactory(
    supabase,
    profile.factory_id,
    fields.collector_id,
  );
  if (collectorError) return collectorError;

  const { error } = await supabase.from("suppliers").insert({ factory_id: profile.factory_id, ...fields });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(SUPPLIERS_PATH);
  return { ok: true, notice: "Supplier added." };
}

export async function updateSupplier(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("suppliers");
  const fields = supplierFields(formData);
  if (!id) return { ok: false, error: "Supplier id is required." };
  if (!fields.name) return { ok: false, error: "Supplier name is required." };
  if (fields.land_size_acres != null && (!Number.isFinite(Number(fields.land_size_acres)) || Number(fields.land_size_acres) < 0)) {
    return { ok: false, error: "Land size must be zero or greater." };
  }
  const collectorError = await collectorBelongsToFactory(
    supabase,
    profile.factory_id,
    fields.collector_id,
  );
  if (collectorError) return collectorError;

  const { data, error } = await supabase
    .from("suppliers")
    .update(fields)
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: "Supplier not found." };

  revalidatePath(SUPPLIERS_PATH);
  return { ok: true, notice: "Supplier updated." };
}

function selectedIds(formData: FormData) {
  return [...new Set(formData.getAll("selected_ids").map(String).filter(Boolean))];
}

export async function setSelectedSuppliersActive(active: boolean, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("suppliers");
  const ids = selectedIds(formData);
  if (ids.length === 0) return { ok: false, error: "Select at least one supplier." };

  const { data: existing, error: readError } = await supabase
    .from("suppliers")
    .select("id")
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (readError) return { ok: false, error: friendlyError(readError) };
  if ((existing ?? []).length !== ids.length) {
    return { ok: false, error: "One or more selected suppliers are no longer available." };
  }

  const { error } = await supabase
    .from("suppliers")
    .update({ active })
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(SUPPLIERS_PATH);
  return {
    ok: true,
    notice: `${ids.length} supplier${ids.length === 1 ? "" : "s"} ${active ? "reactivated" : "deactivated"}.`,
  };
}
