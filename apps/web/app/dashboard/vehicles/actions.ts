"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { ListInvalidation } from "@/lib/list-resources";
import { requirePagePermission } from "@/lib/profile";

const VEHICLES_PATH = "/dashboard/vehicles";
const LINES_PATH = "/dashboard/lines";

function lineInvalidation(): ListInvalidation[] {
  return [{ kind: "exact", resource: { key: "leaf.lines" } }];
}

function vehicleFields(formData: FormData) {
  const capacity = String(formData.get("capacity_kg") ?? "").trim();
  return {
    vehicle_no: String(formData.get("vehicle_no") ?? "").trim(),
    make_model: String(formData.get("make_model") ?? "").trim() || null,
    capacity_kg: capacity ? capacity : null,
  };
}

function validate(fields: ReturnType<typeof vehicleFields>): string | null {
  if (!fields.vehicle_no) return "Vehicle number is required.";
  if (fields.capacity_kg != null && (!Number.isFinite(Number(fields.capacity_kg)) || Number(fields.capacity_kg) < 0)) {
    return "Capacity must be zero or greater.";
  }
  return null;
}

export async function createVehicle(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("vehicles", "create");
  const fields = vehicleFields(formData);
  const invalid = validate(fields);
  if (invalid) return { ok: false, error: invalid };

  const { error } = await supabase.from("vehicles").insert({ factory_id: profile.factory_id, ...fields });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(VEHICLES_PATH);
  revalidatePath(LINES_PATH);
  return { ok: true, notice: "Vehicle added.", invalidate: lineInvalidation() };
}

export async function updateVehicle(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("vehicles", "update");
  if (!id) return { ok: false, error: "Vehicle id is required." };
  const fields = vehicleFields(formData);
  const invalid = validate(fields);
  if (invalid) return { ok: false, error: invalid };

  const { data, error } = await supabase
    .from("vehicles")
    .update(fields)
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: "Vehicle not found." };

  revalidatePath(VEHICLES_PATH);
  revalidatePath(LINES_PATH);
  return { ok: true, notice: "Vehicle updated.", invalidate: lineInvalidation() };
}

function selectedIds(formData: FormData) {
  return [...new Set(formData.getAll("selected_ids").map(String).filter(Boolean))];
}

export async function setSelectedVehiclesActive(active: boolean, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("vehicles", "update");
  const ids = selectedIds(formData);
  if (ids.length === 0) return { ok: false, error: "Select at least one vehicle." };

  const { data: existing, error: readError } = await supabase
    .from("vehicles")
    .select("id")
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (readError) return { ok: false, error: friendlyError(readError) };
  if ((existing ?? []).length !== ids.length) {
    return { ok: false, error: "One or more selected vehicles are no longer available." };
  }

  const { error } = await supabase
    .from("vehicles")
    .update({ active })
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(VEHICLES_PATH);
  revalidatePath(LINES_PATH);
  return {
    ok: true,
    notice: `${ids.length} vehicle${ids.length === 1 ? "" : "s"} ${active ? "reactivated" : "deactivated"}.`,
    invalidate: lineInvalidation(),
  };
}
