"use client";

import { useRouter } from "next/navigation";
import { DetailRecordPanel, DetailWorkspace } from "@/components/detail-workspace";
import { showAppToast } from "@/components/action-feedback";
import { startNavigationFeedback } from "@/components/navigation-progress";
import { SubmitButton } from "@/components/submit-button";
import { createDispatchWithId } from "../actions";
import { InvoiceSideList, INVOICE_SEARCH_PANEL_ID } from "../invoice-side-list";
import { NewDispatchFields, type DispatchCreationOptions } from "../new-dispatch-form";

/**
 * The factory's very first dispatch invoice. Deliberately renders the same
 * workspace shell as the invoice detail page — rail, search, state strip,
 * one attribute panel — so creating the first record looks like editing any
 * later one rather than a separate standalone form.
 */
export function NewBrokerInvoiceBootstrap(props: Omit<DispatchCreationOptions, "dispatchHistory">) {
  const router = useRouter();

  async function create(formData: FormData) {
    const result = await createDispatchWithId(formData);
    if (!result.ok) {
      showAppToast(result.error, "error");
      return;
    }
    showAppToast(result.notice ?? "Dispatch invoice created.");
    if (result.id) {
      startNavigationFeedback();
      router.push(`/dashboard/auction/${result.id}`);
    }
  }

  return (
    <DetailWorkspace
      rail={<InvoiceSideList rows={[]} currentId="" />}
      railAriaLabel="Dispatch invoices"
      searchAction={{ panelId: INVOICE_SEARCH_PANEL_ID }}
      state={{
        currentKey: "draft",
        testId: "invoice-state-indicator",
        steps: [
          { key: "draft", label: "Draft", metric: "0 lots" },
          { key: "invoiced", label: "Invoiced", metric: "0 lot invoices" },
          { key: "grn", label: "GRN", metric: "Document or manual" },
          { key: "catalogued", label: "Catalogued", metric: "0/0 lots" },
        ],
      }}
    >
      <form action={create}>
        <DetailRecordPanel
          tone="draft"
          eyebrow="Draft dispatch invoice"
          title={`Dispatch Invoice Details · ${props.nextDispatchNo}`}
          description="No dispatch invoices exist yet for this factory. Enter the first invoice's details here."
          contentClassName="pt-5"
          actions={<SubmitButton variant="primary" pendingText="Saving…">Save</SubmitButton>}
        >
          <NewDispatchFields {...props} dispatchHistory={[]} />
        </DetailRecordPanel>
      </form>
    </DetailWorkspace>
  );
}
