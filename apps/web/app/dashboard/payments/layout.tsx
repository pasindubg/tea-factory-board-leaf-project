import { PaymentsNav } from "./payments-nav";

// The payments module is readable by dynamically entitled roles; individual
// mutations narrow access to management or owner-only commands server-side.
export default async function PaymentsLayout({ children }: { children: React.ReactNode }) {
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
