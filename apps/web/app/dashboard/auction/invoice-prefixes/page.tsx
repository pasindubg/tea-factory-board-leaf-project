import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { PrefixesTable, type PrefixTableRow } from "./prefixes-table";

export default async function InvoicePrefixesPage() {
  const { profile } = await requirePageAccess("auction-invoice-prefixes");
  const canManage = profile.role === "owner" || profile.role === "manager" || profile.role === "supervisor";

  const prefixes = await loadListResource({ key: "auction.invoice-prefixes" });
  if (!prefixes.ok) throw new Error(prefixes.error);

  const rows: PrefixTableRow[] = prefixes.rows;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Invoice number prefixes</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Each category (broker invoice, regular invoice) has one active numbering book at a time. When a book&apos;s cycle
          runs out, create a new prefix and activate it — new entries then use it automatically.
        </p>
      </div>
      <PrefixesTable rows={rows} canManage={canManage} />
    </div>
  );
}
