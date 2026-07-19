"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { requireModuleAccess } from "@/lib/profile";

// FA3 (issue #13): the factory composes a message to one supplier or broadcasts
// to all of them. Suppliers read it in their field-app inbox (RLS scopes
// visibility). Birthday wishes / promotions will reuse this surface.

const MSG = "/dashboard/messages";
const str = (value: FormDataEntryValue | null) => String(value ?? "").trim();

export async function sendMessage(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("messages");
  const title = str(formData.get("title"));
  const body = str(formData.get("body"));
  const target = str(formData.get("target"));

  if (!title || !body) return { ok: false, error: "A title and a message are both required." };
  if (title.length > 120) return { ok: false, error: "The message title must be 120 characters or fewer." };
  if (!target) return { ok: false, error: "Choose a supplier or select the broadcast option." };

  const supplierId = target !== "all" ? target : null;
  if (supplierId) {
    // The selected recipient came from the browser. Resolve it again through
    // the signed-in tenant client before attaching it to the message.
    const { data: supplier, error: supplierError } = await supabase
      .from("suppliers")
      .select("id")
      .eq("id", supplierId)
      .eq("factory_id", profile.factory_id)
      .eq("active", true)
      .maybeSingle();
    if (supplierError) return { ok: false, error: friendlyError(supplierError) };
    if (!supplier) return { ok: false, error: "Choose an active supplier from this factory." };
  }

  const { error } = await supabase.from("supplier_messages").insert({
    factory_id: profile.factory_id,
    supplier_id: supplierId,
    title,
    body,
    created_by: profile.id,
  });
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath(MSG);
  return {
    ok: true,
    notice: supplierId ? "Message sent to the supplier." : "Broadcast sent to all suppliers.",
  };
}
