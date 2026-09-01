import { requirePageAccess } from "@/lib/profile";
import { previewAuctionReset } from "./_actions/reset";
import { latestJobRun } from "@/lib/background-jobs-server";
import { requireProfile } from "@/lib/profile";
import { AuctionDataWorkbench } from "./auction-data-workbench";

/**
 * Owner-only go-live tooling: clear the factory's auction transaction data,
 * then load its historic Dispatch Schedule spreadsheet.
 *
 * Deliberately kept out of the Auction module's own navigation. It is not part
 * of day-to-day work — it is used once at cutover and while testing — and a
 * destructive reset should not sit next to the screens people use daily.
 */
export default async function AuctionDataPage() {
  await requirePageAccess("auction-data");
  const { supabase, profile } = await requireProfile(["owner"]);
  const [preview, run] = await Promise.all([
    previewAuctionReset(),
    latestJobRun(supabase, profile.factory_id, "auction.dispatch-import"),
  ]);
  if (!preview.ok) throw new Error(preview.error);
  if (!run.ok) throw new Error(run.error);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Auction data — reset &amp; import</h2>
        <p className="mt-1 max-w-3xl text-sm text-stone-500 dark:text-stone-400">
          Clear the auction transactions this factory has recorded, then load the historic Dispatch
          Schedule spreadsheet. Every row is entered through the ordinary Invoice Overview flow, so
          dispatch invoices, dispatches, numbering and re-print chains are all created exactly as they
          are by hand — and anything the application would reject is reported per row.
        </p>
      </div>
      {/* The last run is read on the server so a freshly opened tab shows an
          in-flight import immediately, without waiting for a poll. */}
      <AuctionDataWorkbench entities={preview.entities} total={preview.total} initialRun={run.run} />
    </div>
  );
}
