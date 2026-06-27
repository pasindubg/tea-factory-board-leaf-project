"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { getDefaultRoles } from "@/lib/roles";

// FA3 (issue #13): the factory composes a message to one supplier or broadcasts
// to all of them. Suppliers read it in their field-app inbox (RLS scopes
// visibility). Birthday wishes / promotions will reuse this surface.

const MSG = "/dashboard/messages";
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const back = (error: string): never => redirect(`${MSG}?error=${encodeURIComponent(error)}`);
const ok = (notice: string): never => redirect(`${MSG}?notice=${encodeURIComponent(notice)}`);

export async function sendMessage(formData: FormData) {
  const { supabase, profile } = await requireProfile(getDefaultRoles("messages"));
  const title = str(formData.get("title"));
  const body = str(formData.get("body"));
  const target = str(formData.get("target")); // "all" or a supplier id
  if (!title || !body) return back("A title and a message are both required.");

  const supplierId = target && target !== "all" ? target : null;
  const { error } = await supabase.from("supplier_messages").insert({
    factory_id: profile.factory_id,
    supplier_id: supplierId,
    title,
    body,
    created_by: profile.id,
  });
  if (error) return back(error.message);

  revalidatePath(MSG);
  ok(supplierId ? "Message sent to the supplier." : "Broadcast sent to all suppliers.");
}
