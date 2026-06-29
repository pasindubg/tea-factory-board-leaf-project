import { requireModuleAccess } from "@/lib/profile";

export default async function AuctionLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("auction");
  return <>{children}</>;
}
