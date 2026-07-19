"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { requireModuleAccess } from "@/lib/profile";

// Web side of the issue-#13 field-app request flow. Approving a request that
// creates an advance stays inside the established database function so its
// read/check/adjustment/update sequence remains atomic.

const REQ = "/dashboard/requests";
const str = (value: FormDataEntryValue | null) => String(value ?? "").trim();

async function pendingRequest(
  supabase: Awaited<ReturnType<typeof requireModuleAccess>>["supabase"],
  factoryId: string,
  id: string,
) {
  return supabase
    .from("supplier_requests")
    .select("id")
    .eq("id", id)
    .eq("factory_id", factoryId)
    .eq("status", "pending")
    .maybeSingle();
}

export async function approveRequest(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("requests");
  const id = str(formData.get("id"));
  if (!id) return { ok: false, error: "Select a pending request to approve." };

  const { data: request, error: requestError } = await pendingRequest(supabase, profile.factory_id, id);
  if (requestError) return { ok: false, error: friendlyError(requestError) };
  if (!request) return { ok: false, error: "This request is no longer pending. Refresh and try again." };

  const { data, error } = await supabase.rpc("approve_supplier_request", {
    p_request_id: id,
    p_decided_by: profile.id,
  });
  if (error) return { ok: false, error: friendlyError(error) };

  // approve_supplier_request returns TABLE(...) so data is an array of rows.
  const rows = (data ?? []) as unknown as {
    approved: boolean;
    adjustment_id: string | null;
    error_message: string | null;
  }[];
  const result = rows[0];
  if (!result?.approved) return { ok: false, error: result?.error_message ?? "Approval failed." };

  revalidatePath(REQ);
  return {
    ok: true,
    notice: result.adjustment_id
      ? "Approved — advance recorded as a deduction for next month's payment."
      : "Request approved.",
  };
}

export async function declineRequest(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("requests");
  const id = str(formData.get("id"));
  if (!id) return { ok: false, error: "Select a pending request to decline." };

  const { data, error } = await supabase
    .from("supplier_requests")
    .update({ status: "declined", decided_by: profile.id, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: "This request is no longer pending. Refresh and try again." };

  revalidatePath(REQ);
  return { ok: true, notice: "Request declined." };
}

export async function handToDriver(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("requests");
  const id = str(formData.get("id"));
  if (!id) return { ok: false, error: "Select an approved request to hand over." };

  const { data, error } = await supabase
    .from("supplier_requests")
    .update({ status: "handed_to_driver", handed_by: profile.id, handed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: "This request is no longer awaiting handover. Refresh and try again." };

  revalidatePath(REQ);
  return {
    ok: true,
    notice: "Marked handed to driver — awaiting the supplier's acknowledgement on their app.",
  };
}
