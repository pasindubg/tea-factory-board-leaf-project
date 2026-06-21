"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { getDefaultRoles } from "@/lib/roles";

// Web side of the issue-#13 field-app request flow. A supplier raises a request
// on the phone; here owner/manager/supervisor approve, decline, and mark the
// cash handed to the driver. Approving a `creates_advance` type writes an M6
// supplier_adjustments deduction so it recovers against next month's payment —
// the real ERP integration point.

const REQ = "/dashboard/requests";
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const money = (n: number) => n.toFixed(2);
const back = (error: string): never => redirect(`${REQ}?error=${encodeURIComponent(error)}`);
const ok = (notice: string): never => redirect(`${REQ}?notice=${encodeURIComponent(notice)}`);

type RequestRow = {
  id: string;
  supplier_id: string;
  type_key: string;
  amount: string | null;
  status: string;
};

export async function approveRequest(formData: FormData) {
  const { supabase, profile } = await requireProfile(getDefaultRoles("requests"));
  const id = str(formData.get("id"));
  if (!id) back("Missing request id.");

  const { data: req } = await supabase
    .from("supplier_requests")
    .select("id, supplier_id, type_key, amount, status")
    .eq("id", id)
    .maybeSingle();
  const request = req as RequestRow | null;
  if (!request) return back("Request not found.");
  if (request.status !== "pending") return back("Only pending requests can be approved.");

  // Does approving this type post an advance deduction into the payment ledger?
  const { data: type } = await supabase
    .from("request_types")
    .select("creates_advance")
    .eq("key", request.type_key)
    .maybeSingle();

  let adjustmentId: string | null = null;
  if (type?.creates_advance) {
    const amount = request.amount != null ? Number(request.amount) : NaN;
    if (!(amount > 0)) back("This advance needs a positive amount before approval.");
    const today = new Date();
    const { data: adj, error: adjErr } = await supabase
      .from("supplier_adjustments")
      .insert({
        factory_id: profile.factory_id,
        supplier_id: request.supplier_id,
        kind: "advance",
        label: "Field-app advance request",
        amount: money(amount),
        occurred_on: today.toISOString().slice(0, 10),
        period_year: today.getFullYear(),
        period_month: today.getMonth() + 1,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (adjErr) back(adjErr.message);
    adjustmentId = adj!.id as string;
  }

  const { error } = await supabase
    .from("supplier_requests")
    .update({
      status: "approved",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
      adjustment_id: adjustmentId,
    })
    .eq("id", id);
  if (error) back(error.message);

  revalidatePath(REQ);
  ok(
    adjustmentId
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
