"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { requirePagePermission } from "@/lib/profile";

const DEVICES_PATH = "/dashboard/user-handling/devices";

export async function revokeSelectedDevices(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("user-devices", "update");
  const ids = [...new Set(formData.getAll("selected_ids").map(String).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "Select at least one device." };

  const { error } = await supabase
    .from("user_devices")
    .update({ revoked_at: new Date().toISOString(), revoked_by: profile.id })
    .in("id", ids)
    .eq("factory_id", profile.factory_id)
    .is("revoked_at", null);
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(DEVICES_PATH);
  return {
    ok: true,
    notice: `${ids.length} device${ids.length === 1 ? "" : "s"} released. The user can now sign in on a new phone.`,
  };
}
