import { requireModuleAccess } from "@/lib/profile";
import { AuctionNav } from "./auction-nav";

// Auction & settlement (A-track). Sub-nav shared across all auction pages.
export default async function AuctionLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("auction");
  return (
    <div>
      <h1 className="text-2xl font-semibold print:hidden">Auction &amp; settlement</h1>
      <div className="print:hidden">
        <AuctionNav />
      </div>
      {children}
    </div>
  );
}
