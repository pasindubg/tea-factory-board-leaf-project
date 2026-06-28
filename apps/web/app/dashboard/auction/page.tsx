import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";
import { DispatchesTable } from "./dispatches-table";

export default async function AuctionSalesPage() {
  const { supabase, profile } = await requireModuleAccess("auction");
  const isOwner = profile.role === "owner";
  const { data: sales } = await supabase
    .from("auction_sales")
    .select("id, sale_no, target_sale_no, dispatch_date, sale_date, prompt_date, status, brokers(name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Dispatches Overview</h2>
        <Link
          href="/dashboard/auction/new"
          className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          New dispatch
        </Link>
      </div>

      <div className="mt-4">
        <DispatchesTable
          sales={(sales ?? []).map((s) => ({
            id: s.id as string,
            sale_no: s.sale_no as string,
            target_sale_no: (s as unknown as { target_sale_no?: string }).target_sale_no,
            dispatch_date: (s as unknown as { dispatch_date?: string }).dispatch_date,
            sale_date: s.sale_date as string | undefined,
            prompt_date: s.prompt_date as string | undefined,
            status: s.status as string,
            brokers: (s.brokers as unknown as { name: string } | null) ?? null,
          }))}
          isOwner={isOwner}
        />
      </div>
    </div>
  );
}
