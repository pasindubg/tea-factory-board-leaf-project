import { loadListResource } from "@/lib/list-resource-registry";
import { SupplierRequestLists } from "./requests-lists";

export default async function RequestsPage() {
  const requestResource = await loadListResource({ key: "communications.supplier-requests" });
  if (!requestResource.ok) throw new Error(requestResource.error);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Supplier requests</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Advances, fertiliser and tea-packet requests raised by suppliers from the field app.
        </p>
      </div>
      <SupplierRequestLists initialRows={requestResource.rows} />
    </div>
  );
}
