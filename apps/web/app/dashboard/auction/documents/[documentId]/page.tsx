import { notFound } from "next/navigation";
import Link from "next/link";
import {
  DetailField,
  DetailRecordPanel,
  DetailWorkspace,
} from "@/components/detail-workspace";
import { requirePageAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { applyServerListSearch } from "@/lib/list-search-state";
import { formatDateTime } from "@/lib/dates";
import { formatSaleNo, saleNoKey } from "../../sale-number";
import { DOC_TYPE_LABELS, docStatus, type AuctionDocType, type DocumentStatus } from "../../doc-status";
import { DocumentsSideList, type DocumentSideListRow } from "../documents-side-list";
import { BankUploadAssistant } from "../bank-upload-assistant";
import { AckContent } from "./ack-content";
import { ValuationContent } from "./valuation-content";
import { ContractContent } from "./contract-content";
import { BankContent } from "./bank-content";
import { GrnContent } from "./grn-content";

const SEARCH_PANEL_ID = "auction-document-detail-search";

const STATUS_STYLE: Record<DocumentStatus, string> = {
  valid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400",
  issue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-400",
};

type DocImportDetailRow = {
  id: string;
  doc_type: AuctionDocType;
  source_filename: string | null;
  status: "parsed" | "reviewed" | "confirmed" | "rejected";
  parsed_at: string | null;
  confirmed_at: string | null;
  sale_id: string | null;
  parsed_json: unknown;
};

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { supabase, profile } = await requirePageAccess("auction-documents");
  const { documentId } = await params;
  const { notice } = await searchParams;

  const { data: doc } = await supabase
    .from("doc_imports")
    .select("id, doc_type, source_filename, status, parsed_at, confirmed_at, sale_id, parsed_json")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) notFound();
  const docRow = doc as DocImportDetailRow;

  const { data: sale } = docRow.sale_id
    ? await supabase.from("auction_sales").select("sale_no, target_sale_no, brokers(name)").eq("id", docRow.sale_id).maybeSingle()
    : { data: null };
  const brokerName = (sale?.brokers as unknown as { name: string } | null)?.name ?? "—";
  const saleNo = formatSaleNo((sale?.target_sale_no as string | null) ?? (sale?.sale_no as string | null)) || null;
  const saleHref = saleNo ? `/dashboard/auction/sales/${encodeURIComponent(saleNoKey(saleNo) || saleNo)}?tab=documents` : null;

  const sideListResource = await loadListResource({ key: "auction.documents-side-list" });
  if (!sideListResource.ok) throw new Error(sideListResource.error);
  const sideListRows: DocumentSideListRow[] = sideListResource.rows;
  const visibleSideListRows = await applyServerListSearch(supabase, profile, "auction-documents-side-list", sideListRows);

  // The side-list resource already derives "active" per (doc type, broker)
  // across every document — reuse it here instead of recomputing.
  const currentSideRow = sideListRows.find((row) => row.id === documentId);
  const { status, label } = docStatus(docRow);
  const active = currentSideRow?.active ?? false;

  return (
    <DetailWorkspace
      rail={<DocumentsSideList rows={visibleSideListRows} currentDocumentId={documentId} searchPanelId={SEARCH_PANEL_ID} />}
      railAriaLabel="Documents"
      searchAction={{ panelId: SEARCH_PANEL_ID }}
      headerActions={<BankUploadAssistant />}
    >
      <DetailRecordPanel
        eyebrow="Document details"
        title={docRow.source_filename ?? "document.pdf"}
        description={`${DOC_TYPE_LABELS[docRow.doc_type]} · ${brokerName}${saleNo ? ` · Sale ${saleNo}` : ""}`}
        contentClassName="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <DetailField label="Document type" value={DOC_TYPE_LABELS[docRow.doc_type]} />
        <DetailField label="Broker" value={brokerName} />
        <DetailField
          label="Sale"
          value={saleHref ? <Link href={saleHref} className="text-green-700 dark:text-green-400 hover:underline">{saleNo}</Link> : "—"}
        />
        <DetailField
          label="Document status"
          value={<span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}>{label}</span>}
        />
        <DetailField label="Active" value={active ? "Yes" : "No"} />
        <DetailField label="Uploaded" value={formatDateTime(docRow.parsed_at)} />
      </DetailRecordPanel>

      <div className="mt-6">
        {!docRow.sale_id ? (
          <p className="rounded-md bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 px-3 py-2 text-sm text-stone-500 dark:text-stone-400">
            This document&apos;s broker invoice was removed — historical record only.
          </p>
        ) : docRow.doc_type === "acknowledgement" ? (
          <AckContent supabase={supabase} profile={profile} saleId={docRow.sale_id} importId={documentId} />
        ) : docRow.doc_type === "valuation" ? (
          <ValuationContent supabase={supabase} profile={profile} saleId={docRow.sale_id} importId={documentId} />
        ) : docRow.doc_type === "contract" ? (
          <ContractContent supabase={supabase} profile={profile} saleId={docRow.sale_id} importId={documentId} />
        ) : docRow.doc_type === "bank_csv" ? (
          <BankContent supabase={supabase} profile={profile} saleId={docRow.sale_id} importId={documentId} notice={notice} />
        ) : (
          <GrnContent saleId={docRow.sale_id} parsedJson={docRow.parsed_json} />
        )}
      </div>
    </DetailWorkspace>
  );
}
