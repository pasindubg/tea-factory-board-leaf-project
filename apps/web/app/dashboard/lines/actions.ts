"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import type { ListInvalidation } from "@/lib/list-resources";
import { requirePagePermission } from "@/lib/profile";

const LINES_PATH = "/dashboard/lines";
const SUPPLIERS_PATH = "/dashboard/suppliers";

function supplierInvalidation(): ListInvalidation[] {
  return [{ kind: "exact", resource: { key: "leaf.suppliers" } }];
}

function lineFields(formData: FormData) {
  return {
    line_no: String(formData.get("line_no") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim() || null,
    vehicle_id: String(formData.get("vehicle_id") ?? "").trim() || null,
  };
}

export async function createLine(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("lines", "create");
  const fields = lineFields(formData);
  if (!fields.line_no) return { ok: false, error: "Line number is required." };

  const { error } = await supabase.from("lines").insert({ factory_id: profile.factory_id, ...fields });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(LINES_PATH);
  return { ok: true, notice: "Line added." };
}

export async function updateLine(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("lines", "update");
  if (!id) return { ok: false, error: "Line id is required." };
  const fields = lineFields(formData);
  if (!fields.line_no) return { ok: false, error: "Line number is required." };

  const { data, error } = await supabase
    .from("lines")
    .update(fields)
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: "Line not found." };

  revalidatePath(LINES_PATH);
  revalidatePath(SUPPLIERS_PATH);
  return { ok: true, notice: "Line updated.", invalidate: supplierInvalidation() };
}

function selectedIds(formData: FormData) {
  return [...new Set(formData.getAll("selected_ids").map(String).filter(Boolean))];
}

export async function setSelectedLinesActive(active: boolean, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("lines", "update");
  const ids = selectedIds(formData);
  if (ids.length === 0) return { ok: false, error: "Select at least one line." };

  const { data: existing, error: readError } = await supabase
    .from("lines")
    .select("id")
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (readError) return { ok: false, error: friendlyError(readError) };
  if ((existing ?? []).length !== ids.length) {
    return { ok: false, error: "One or more selected lines are no longer available." };
  }

  const { error } = await supabase
    .from("lines")
    .update({ active })
    .in("id", ids)
    .eq("factory_id", profile.factory_id);
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(LINES_PATH);
  return {
    ok: true,
    notice: `${ids.length} line${ids.length === 1 ? "" : "s"} ${active ? "reactivated" : "deactivated"}.`,
  };
}

export async function assignDriverToLine(lineId: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("lines", "update");
  const driverId = String(formData.get("driver_id") ?? "").trim();
  if (!lineId) return { ok: false, error: "Line id is required." };
  if (!driverId) return { ok: false, error: "Pick a driver to assign." };

  const { data: line, error: lineError } = await supabase
    .from("lines")
    .select("id")
    .eq("id", lineId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (lineError) return { ok: false, error: friendlyError(lineError) };
  if (!line) return { ok: false, error: "Line not found." };

  const { error } = await supabase
    .from("line_drivers")
    .insert({ factory_id: profile.factory_id, line_id: lineId, driver_id: driverId });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(LINES_PATH);
  return {
    ok: true,
    notice: "Driver assigned.",
    invalidate: [{ kind: "exact", resource: { key: "leaf.lines" } }],
  };
}

export async function removeSelectedLineDrivers(lineId: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("lines", "update");
  const ids = selectedIds(formData);
  if (ids.length === 0) return { ok: false, error: "Select at least one assignment." };

  const { error } = await supabase
    .from("line_drivers")
    .delete()
    .in("id", ids)
    .eq("line_id", lineId)
    .eq("factory_id", profile.factory_id);
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(LINES_PATH);
  return {
    ok: true,
    notice: `${ids.length} driver${ids.length === 1 ? "" : "s"} unassigned.`,
    invalidate: [{ kind: "exact", resource: { key: "leaf.lines" } }],
  };
}
