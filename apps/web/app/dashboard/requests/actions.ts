"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { getDefaultRoles } from "@/lib/roles";

// Web side of the issue-#13 field-app request flow. A supplier raises a request
// on the phone; here owner/manager/supervisor approve, decline, and mark the
// cash handed to the driver. Approving a `creates_advance` type calls the atomic
// `approve_supplier_request` Postgres function so the read-check-insert-update
// chain runs in one transaction — no TOCTOU race (Issue #1, PR #18 review).

const REQ = "/dashboard/requests";
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const back = (error: string): never => redirect(`${REQ}?error=${encodeURIComponent(error)}`);
const ok = (notice: string): never => redirect(`${REQ}?notice=${encodeURIComponent(notice)}`);

export async function approveRequest(formData: FormData) {
  const { supabase, profile } = await requireProfile(getDefaultRoles("requests"));
  const id = str(formData.get("id"));
  if (!id) back("Missing request id.");

  const { data, error } = await supabase.rpc("approve_supplier_request", {
    p_request_id: id,
    p_decided_by: profile.id,
  });

  if (error) back(error.message);

  // approve_supplier_request returns TABLE(...) so data is an array of rows.
  const rows = (data ?? []) as unknown as {
    approved: boolean;
    adjustment_id: string | null;
    error_message: string | null;
  }[];
  const result = rows[0];

  if (!result?.approved) {
    back(result?.error_message ?? "Approval failed.");
  }

  revalidatePath(REQ);
  ok(
    result.adjustment_id
      ? "Approved — advance recorded as a deduction for next month's payment."
      : "Request approved.",
  );
}

export async function declineRequest(formData: FormData) {
  const { supabase, profile } = await requireProfile(getDefaultRoles("requests"));
  const id = str(formData.get("id"));
  if (!id) back("Missing request id.");

  // Guard the transition in the query so a concurrent change can't be clobbered.
  const { error } = await supabase
    .from("supplier_requests")
    .update({ status: "declined", decided_by: profile.id, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  if (error) back(error.message);

  revalidatePath(REQ);
  ok("Request declined.");
}

export async function handToDriver(formData: FormData) {
  const { supabase, profile } = await requireProfile(getDefaultRoles("requests"));
  const id = str(formData.get("id"));
  if (!id) back("Missing request id.");

  const { error } = await supabase
    .from("supplier_requests")
    .update({ status: "handed_to_driver", handed_by: profile.id, handed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved");
  if (error) back(error.message);

  revalidatePath(REQ);
  ok("Marked handed to driver — awaiting the supplier's acknowledgement on their app.");
}
