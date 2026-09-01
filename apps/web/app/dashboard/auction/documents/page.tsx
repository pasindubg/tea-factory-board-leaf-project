import { redirect } from "next/navigation";
import { DetailWorkspace } from "@/components/detail-workspace";
import { requirePageAccess } from "@/lib/profile";
import { BankUploadAssistant } from "./bank-upload-assistant";
import { DocumentsSideList } from "./documents-side-list";

/**
 * Fallback landing spot for the "Document Details" nav entry: redirects to
 * the most recently uploaded document if any exist. Acknowledgement/
 * valuation/contract documents are uploaded from a Sale Detail page; a GRN
 * from its dispatch invoice page. Only the bank statement CSV can be uploaded
 * here directly, since it isn't tied to a single sale.
 */
export default async function DocumentsPage() {
  const { supabase } = await requirePageAccess("auction-documents");
  const { data: latestDoc } = await supabase
    .from("doc_imports")
    .select("id")
    .order("parsed_at", { ascending: false })
    .limit(1);
  const documentId = latestDoc?.[0]?.id as string | undefined;
  if (documentId) redirect(`/dashboard/auction/documents/${documentId}`);

  return (
    <DetailWorkspace
      rail={<DocumentsSideList rows={[]} currentDocumentId="" searchPanelId="auction-document-detail-search" />}
      railAriaLabel="Documents"
      headerActions={<BankUploadAssistant />}
    >
      <p className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
        No documents have been uploaded yet. Upload an acknowledgement, valuation, or sellers contract from a Sale
        Detail page, or upload a bank statement above.
      </p>
    </DetailWorkspace>
  );
}
