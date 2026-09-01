"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { DetailWorkspace, type DetailWorkspaceState } from "@/components/detail-workspace";
import { startNavigationFeedback } from "@/components/navigation-progress";
import { deleteAuctionSaleGroup } from "../../actions";
import type { SaleSideListRow } from "./sales-side-list";

/**
 * Thin client wrapper so this detail page can use DetailWorkspace's own
 * built-in `deleteAction` (the same owner-only delete-with-confirmation
 * mechanism every other detail page uses, defined once in
 * components/detail-workspace.tsx) instead of a bespoke delete button.
 * `page.tsx` stays a server component and passes down already-built
 * server/client element trees as props/children.
 */
export function SaleDetailWorkspace({
  saleNo,
  isOwner,
  saleListRows,
  rail,
  railAriaLabel,
  searchPanelId,
  state,
  headerActions,
  children,
}: {
  saleNo: string;
  isOwner: boolean;
  /** Same rows behind the rail, already sorted latest-first — used to find
   * another sale's detail page to land on after deleting this one. */
  saleListRows: SaleSideListRow[];
  rail: ReactNode;
  railAriaLabel: string;
  searchPanelId: string;
  state: DetailWorkspaceState;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <DetailWorkspace
      rail={rail}
      railAriaLabel={railAriaLabel}
      searchAction={{ panelId: searchPanelId }}
      state={state}
      headerActions={headerActions}
      deleteAction={isOwner ? {
        title: "Delete this sale?",
        description: "This permanently removes every dispatch invoice under this sale, their lots and invoices, and all financial records for them — sale lines, VAT ledger entries, and settlements. Matched bank transactions are unlinked but kept. This cannot be undone.",
        confirmLabel: "Delete sale",
        errorMessage: "Could not delete this sale. Please try again.",
        action: () => deleteAuctionSaleGroup(saleNo),
        onSuccess: () => {
          startNavigationFeedback();
          // Stay in the detail-page workflow: land on another sale's own
          // detail page rather than bouncing out to the Sales Overview list.
          const nextSale = saleListRows.find((row) => row.saleNo !== saleNo);
          router.replace(nextSale ? `/dashboard/auction/sales/${encodeURIComponent(nextSale.saleNo)}` : "/dashboard/auction/sales");
        },
      } : undefined}
    >
      {children}
    </DetailWorkspace>
  );
}
