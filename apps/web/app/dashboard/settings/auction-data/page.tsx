import { requirePageAccess } from "@/lib/profile";
import { previewAuctionReset } from "./_actions/reset";
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
  await requirePageAccess("settings-auction-data");
  const preview = await previewAuctionReset();
  if (!preview.ok) throw new Error(preview.error);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Auction data — reset &amp; import</h2>
        <p className="mt-1 max-w-3xl text-sm text-stone-500 dark:text-stone-400">
          Clear the auction transactions this factory has recorded, then load the historic Dispatch
          Schedule spreadsheet. Every row is entered through the ordinary Invoice Overview flow, so
          broker invoices, dispatches, numbering and re-print chains are all created exactly as they
          are by hand — and anything the application would reject is reported per row.
        </p>
      </div>
      <AuctionDataWorkbench entities={preview.entities} total={preview.total} />
    </div>
  );
}
