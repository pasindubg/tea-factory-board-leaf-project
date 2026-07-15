import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModuleAccess } from "@/lib/profile";

export default async function DispatchDetailsPage() {
  const { supabase } = await requireModuleAccess("auction");
  const { data: latestDispatch } = await supabase
    .from("auction_bundled_dispatches")
    .select("id")
    .order("dispatch_date_from", { ascending: false })
    .order("dispatch_no", { ascending: false })
    .limit(1);
  const dispatchId = latestDispatch?.[0]?.id as string | undefined;
  if (dispatchId) redirect(`/dashboard/auction/dispatches/${dispatchId}`);

  return <div className="rounded-xl border border-stone-200 bg-white p-8 text-center dark:border-stone-700 dark:bg-stone-900">
    <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">No dispatch details yet</h2>
    <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Create the first dispatch from the built-in New action on Dispatch Overview.</p>
    <Link href="/dashboard/auction/dispatches" className="mt-5 inline-flex rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 dark:bg-green-500 dark:text-green-950">Open Dispatch Overview</Link>
  </div>;
}
