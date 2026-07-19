import { loadListResource } from "@/lib/list-resource-registry";
import { requireModuleAccess } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { PaymentsFilter } from "./payments-filter";
import { PaymentsTable } from "./payments-table";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { profile } = await requireModuleAccess("payments");
  const params = await searchParams;
  const now = new Date();
  const requestedYear = Number(params.year);
  const requestedMonth = Number(params.month);
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
    ? requestedYear
    : now.getFullYear();
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
    ? requestedMonth
    : now.getMonth() + 1;

  const paymentResource = await loadListResource({
    key: "payments.statements",
    params: { year, month },
  });
  if (!paymentResource.ok) throw new Error(paymentResource.error);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PaymentsFilter year={year} month={month} />
        <p className="max-w-2xl text-xs text-stone-500 dark:text-stone-400">
          Regenerating recomputes pending statements from current rates, tiers, and adjustments. Paid statements remain unchanged.
        </p>
      </div>
      <PaymentsTable
        rows={paymentResource.rows}
        year={year}
        month={month}
        canManage={MANAGEMENT_ROLES.includes(profile.role)}
      />
    </div>
  );
}
