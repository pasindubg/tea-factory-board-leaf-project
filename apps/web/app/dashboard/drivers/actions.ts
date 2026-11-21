"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { ListInvalidation } from "@/lib/list-resources";
import { requirePagePermission } from "@/lib/profile";

const DRIVERS_PATH = "/dashboard/drivers";
const LINES_PATH = "/dashboard/lines";

function lineInvalidation(): ListInvalidation[] {
  return [{ kind: "exact", resource: { key: "leaf.lines" } }];
}

function driverFields(formData: FormData) {
  return {
    user_id: String(formData.get("user_id") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    nic_number: String(formData.get("nic_number") ?? "").trim() || null,
    licence_no: String(formData.get("licence_no") ?? "").trim() || null,
  };
}

export async function createDriver(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("drivers", "create");
  const fields = driverFields(formData);
  if (!fields.user_id) return { ok: false, error: "Choose an existing Driver user in User ID." };
  const { data: user, error: userError } = await supabase.from("users").select("id, name")
    .eq("id", fields.user_id).eq("role", "driver").eq("active", true).maybeSingle();
  if (userError) return { ok: false, error: friendlyError(userError) };
  if (!user) return { ok: false, error: "User ID must be an active Driver user in this factory." };

  const { error } = await supabase.from("drivers").insert({ factory_id: profile.factory_id, ...fields, name: user.name });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(DRIVERS_PATH);
  revalidatePath(LINES_PATH);
  return { ok: true, notice: "Driver added.", invalidate: lineInvalidation() };
}

export async function updateDriver(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("drivers", "update");
  if (!id) return { ok: false, error: "Driver id is required." };
  const fields = driverFields(formData);
  if (!fields.user_id) return { ok: false, error: "Choose an existing Driver user in User ID." };
  const { data: user, error: userError } = await supabase.from("users").select("id, name")
    .eq("id", fields.user_id).eq("role", "driver").eq("active", true).maybeSingle();
  if (userError) return { ok: false, error: friendlyError(userError) };
  if (!user) return { ok: false, error: "User ID must be an active Driver user in this factory." };

  const { data, error } = await supabase
    .from("drivers")
    .update({ ...fields, name: user.name })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: "Driver not found." };

  revalidatePath(DRIVERS_PATH);
  revalidatePath(LINES_PATH);
  return { ok: true, notice: "Driver updated.", invalidate: lineInvalidation() };
}

function selectedIds(formData: FormData) {
  return [...new Set(formData.getAll("selected_ids").map(String).filter(Boolean))];
}

export async function setSelectedDriversActive(active: boolean, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("drivers", "update");
  const ids = selectedIds(formData);
  if (ids.length === 0) return { ok: false, error: "Select at least one driver." };

  const { data: existing, error: readError } = await supabase
    .from("drivers")
    .select("id")
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (readError) return { ok: false, error: friendlyError(readError) };
  if ((existing ?? []).length !== ids.length) {
    return { ok: false, error: "One or more selected drivers are no longer available." };
  }

  const { error } = await supabase
    .from("drivers")
    .update({ active })
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(DRIVERS_PATH);
  revalidatePath(LINES_PATH);
  return {
    ok: true,
    notice: `${ids.length} driver${ids.length === 1 ? "" : "s"} ${active ? "reactivated" : "deactivated"}.`,
    invalidate: lineInvalidation(),
  };
}
