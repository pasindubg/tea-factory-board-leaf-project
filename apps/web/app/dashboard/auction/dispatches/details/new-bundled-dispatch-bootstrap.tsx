"use client";

import { useRouter } from "next/navigation";
import { showAppToast } from "@/components/action-feedback";
import { startNavigationFeedback } from "@/components/navigation-progress";
import { createBundledDispatch } from "../../actions";
import { BundledDispatchForm, type EligibleBrokerInvoice, type WarehouseOption } from "../bundled-dispatch-form";

export function NewBundledDispatchBootstrap({
  eligibleInvoices,
  warehouses,
  canCreate,
}: {
  eligibleInvoices: EligibleBrokerInvoice[];
  warehouses: WarehouseOption[];
  canCreate: boolean;
}) {
  const router = useRouter();

  async function create(formData: FormData) {
    const result = await createBundledDispatch(formData);
    if (!result.ok) {
      showAppToast(result.error, "error");
      return;
    }
    showAppToast(result.notice ?? "Dispatch created.");
    if (result.id) {
      startNavigationFeedback();
      router.push(`/dashboard/auction/dispatches/${result.id}`);
    }
  }

  if (!canCreate) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">No dispatch details yet</h2>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Only owners and managers can create the first physical dispatch.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
      <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Create the first dispatch</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">No physical dispatches exist yet for this factory. Bundle at least two eligible broker invoices to get started.</p>
      <div className="mt-5">
        <BundledDispatchForm
          invoices={eligibleInvoices}
          warehouses={warehouses}
          action={create}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}
