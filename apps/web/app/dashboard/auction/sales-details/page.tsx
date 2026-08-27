import { requirePageAccess } from "@/lib/profile";
import { saleNoKey } from "../sale-number";
import SaleDetailPage from "../sales/[saleNo]/page";

/**
 * The Sales Detail page at a STABLE address.
 *
 * `/dashboard/auction/sales/[saleNo]` needs a sale number in the URL, which a
 * navigation link cannot know. Rather than have the nav resolve one and point
 * at a number that goes stale, the nav points here and this page picks the sale
 * to open — the most recently dispatched one.
 *
 * It renders the real detail page rather than redirecting, so the address stays
 * `/dashboard/auction/sales-details`. Choosing another sale from the side list
 * still navigates to that sale's own numbered URL, which stays shareable.
 */
export default async function SalesDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { supabase } = await requirePageAccess("auction-sale-detail");

  // A dispatch identifies a sale by its target, or by its own number when it
  // has no target — the same rule the sales pages use everywhere else.
  const { data: latest } = await supabase
    .from("auction_sales")
    .select("sale_no, target_sale_no")
    .eq("sale_kind", "dispatch")
    .order("dispatch_date", { ascending: false, nullsFirst: false })
    .order("target_sale_no", { ascending: false, nullsFirst: false })
    .limit(1);

  const row = latest?.[0];
  // "none" is the placeholder the detail page renders its empty state for, so a
  // factory with no sales yet still gets the page instead of a 404.
  const saleNo = saleNoKey(row?.target_sale_no || row?.sale_no) || "none";

  return <SaleDetailPage params={Promise.resolve({ saleNo })} searchParams={searchParams} />;
}
