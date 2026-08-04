import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { ApprovalsTable } from "./approvals-table";

export default async function PrefixApprovalsPage() {
  await requirePageAccess("auction-prefix-approvals");

  const requests = await loadListResource({ key: "auction.prefix-approvals" });
  if (!requests.ok) throw new Error(requests.error);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Prefix approvals</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Broker- and lot-invoice entries submitted with a prefix other than the active one, awaiting supervisor decision.
        </p>
      </div>
      <ApprovalsTable initialRows={requests.rows} />
    </div>
  );
}
