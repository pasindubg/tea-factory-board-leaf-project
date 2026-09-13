"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { requirePagePermission } from "@/lib/profile";

const SUPPLIERS_PATH = "/dashboard/suppliers";

function supplierFields(formData: FormData) {
  const landSize = String(formData.get("land_size_acres") ?? "").trim();
  const cultivated = String(formData.get("cultivated_area_acres") ?? "").trim();
  return {
    customer_no: String(formData.get("customer_no") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    nic_number: String(formData.get("nic_number") ?? "").trim() || null,
    area: String(formData.get("area") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    land_size_acres: landSize ? landSize : null,
    cultivated_area_acres: cultivated ? cultivated : null,
    bank_account_no: String(formData.get("bank_account_no") ?? "").trim() || null,
    collector_id: String(formData.get("collector_id") ?? "").trim() || null,
    line_id: String(formData.get("line_id") ?? "").trim() || null,
    latitude: String(formData.get("latitude") ?? "").trim(),
    longitude: String(formData.get("longitude") ?? "").trim(),
  };
}

function coordinateError(value: string, label: string, limit: number): string | null {
  if (!value) return `${label} is required.`;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < -limit || parsed > limit) {
    return `${label} must be between -${limit} and ${limit}.`;
  }
  return null;
}

/** The starred registration fields, enforced here as well as by the database. */
function mandatoryFieldError(fields: ReturnType<typeof supplierFields>): string | null {
  if (!fields.customer_no) return "Customer number is required.";
  if (!/^[0-9]+$/.test(fields.customer_no)) return "Customer number must be digits only.";
  if (!fields.name) return "Customer name is required.";
  if (!fields.phone) return "Mobile number is required.";
  return (
    coordinateError(fields.latitude, "Latitude", 90) ??
    coordinateError(fields.longitude, "Longitude", 180)
  );
}

function acreageError(fields: ReturnType<typeof supplierFields>): string | null {
  for (const [value, label] of [
    [fields.land_size_acres, "Land size"],
    [fields.cultivated_area_acres, "Cultivated area"],
  ] as const) {
    if (value != null && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      return `${label} must be zero or greater.`;
    }
  }
  return null;
}

async function collectorBelongsToFactory(
  supabase: Awaited<ReturnType<typeof requirePagePermission>>["supabase"],
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
  const { supabase, profile } = await requirePagePermission("suppliers", "create");
  const fields = supplierFields(formData);
  const missing = mandatoryFieldError(fields);
  if (missing) return { ok: false, error: missing };
  const invalidAcreage = acreageError(fields);
  if (invalidAcreage) return { ok: false, error: invalidAcreage };
  const collectorError = await collectorBelongsToFactory(
    supabase,
    profile.factory_id,
    fields.collector_id,
  );
  if (collectorError) return collectorError;

  const { error } = await supabase.from("suppliers").insert({ factory_id: profile.factory_id, ...fields });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(SUPPLIERS_PATH);
  return { ok: true, notice: "Customer added." };
}

export async function updateSupplier(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("suppliers", "update");
  const fields = supplierFields(formData);
  if (!id) return { ok: false, error: "Customer id is required." };
  const missing = mandatoryFieldError(fields);
  if (missing) return { ok: false, error: missing };
  const invalidAcreage = acreageError(fields);
  if (invalidAcreage) return { ok: false, error: invalidAcreage };
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
  if (!data) return { ok: false, error: "Customer not found." };

  revalidatePath(SUPPLIERS_PATH);
  return { ok: true, notice: "Customer updated." };
}

function selectedIds(formData: FormData) {
  return [...new Set(formData.getAll("selected_ids").map(String).filter(Boolean))];
}

export async function setSelectedSuppliersActive(active: boolean, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("suppliers", "update");
  const ids = selectedIds(formData);
  if (ids.length === 0) return { ok: false, error: "Select at least one customer." };

  const { data: existing, error: readError } = await supabase
    .from("suppliers")
    .select("id")
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (readError) return { ok: false, error: friendlyError(readError) };
  if ((existing ?? []).length !== ids.length) {
    return { ok: false, error: "One or more selected customers are no longer available." };
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
    notice: `${ids.length} customer${ids.length === 1 ? "" : "s"} ${active ? "reactivated" : "deactivated"}.`,
  };
}
