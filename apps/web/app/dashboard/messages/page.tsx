import { friendlyError } from "@/lib/errors";
import { loadListResource } from "@/lib/list-resource-registry";
import { requireModuleAccess } from "@/lib/profile";
import { MessagesList } from "./messages-list";

export default async function MessagesPage() {
  const { supabase } = await requireModuleAccess("messages");
  const [{ data: suppliers, error: supplierError }, messageResource] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
    loadListResource({ key: "communications.sent-messages" }),
  ]);
  if (supplierError) throw new Error(friendlyError(supplierError));
  if (!messageResource.ok) throw new Error(messageResource.error);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Send a note to one supplier or broadcast to all. They see it in the field app.
        </p>
      </div>
      <MessagesList
        initialRows={messageResource.rows}
        suppliers={(suppliers ?? []).map((supplier) => ({ id: supplier.id, name: supplier.name }))}
      />
    </div>
  );
}
