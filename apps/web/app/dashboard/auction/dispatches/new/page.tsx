import { redirect } from "next/navigation";
import { requireModuleAccess } from "@/lib/profile";

/** Legacy bookmark retained for compatibility; creation now belongs to the
 * Dispatch Overview list's built-in New action. */
export default async function NewBundledDispatchPage() {
  await requireModuleAccess("auction");
  redirect("/dashboard/auction/dispatches");
}
