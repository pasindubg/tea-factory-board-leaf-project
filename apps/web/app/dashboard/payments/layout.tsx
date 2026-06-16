import { requireModuleAccess } from "@/lib/profile";
import { PaymentsNav } from "./payments-nav";

// Payments is management-only; the sub-nav is shared across all payment pages.
export default async function PaymentsLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("payments");
  return (
    <div>
      <h1 className="text-2xl font-semibold print:hidden">Payments</h1>
      <div className="print:hidden">
        <PaymentsNav />
      </div>
      {children}
    </div>
  );
}
