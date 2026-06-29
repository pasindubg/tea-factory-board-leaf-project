// Shared, non-action helpers for the auction server actions. This module is NOT
// "use server" — a server-action file may only export async actions, so every
// sync helper, type, and DB utility that more than one action file needs lives
// here and is imported by the concern-specific files in this folder.
import { createHash } from "crypto";
import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import { parseBankCsv, reconcileBank } from "@tea/api";
import { requireProfile } from "@/lib/profile";
import { getDefaultRoles } from "@/lib/roles";

export const AUC = "/dashboard/auction";
export const REP = "/dashboard/auction/reports";
export const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
export const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());
export const roles = () => getDefaultRoles("auction");
export const back = (path: string, error: string): never => redirect(`${path}?error=${encodeURIComponent(error)}`);

export type Supa = Awaited<ReturnType<typeof requireProfile>>["supabase"];
export type DocType = "acknowledgement" | "valuation" | "contract" | "bank_csv";

// Extract the merged text of an uploaded PDF, or null if it's missing/unreadable.
export async function extractPdf(file: FormDataEntryValue | null): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const extracted = await extractText(pdf, { mergePages: true });
    return Array.isArray(extracted.text) ? extracted.text.join(" ") : extracted.text;
  } catch {
    return null;
  }
}

export const toISODate = (d: string | null): string | null => {
  const m = d?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// Parse → stage into doc_imports (idempotent on factory_id + content hash).
// Returns the import id. The single staging path for every document type.
export async function stageImport(
  supabase: Supa,
  factoryId: string,
  saleId: string,
  docType: DocType,
  filename: string,
  text: string,
  parsed: unknown,
): Promise<string | null> {
  const contentHash = createHash("sha256").update(text).digest("hex");
  const { data: existing } = await supabase
    .from("doc_imports")
    .select("id")
    .eq("factory_id", factoryId)
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (existing?.id) {
    await supabase
      .from("doc_imports")
      .update({ parsed_json: parsed, status: "parsed", sale_id: saleId, source_filename: filename, doc_type: docType })
      .eq("id", existing.id);
    return existing.id as string;
  }
  const { data } = await supabase
    .from("doc_imports")
    .insert({
      factory_id: factoryId,
      doc_type: docType,
      source_filename: filename,
      content_hash: contentHash,
      parsed_json: parsed,
      status: "parsed",
      sale_id: saleId,
    })
    .select("id")
    .single();
  return (data?.id as string) ?? null;
}

export async function writeAudit(supabase: Supa, factoryId: string, row: {
  saleId?: string | null; lotId?: string | null; action: string; detail: string;
  reason?: string | null; actor: string; confidenceShown?: number | null; weightDelta?: number | null;
}) {
  await supabase.from("auction_audit").insert({
    factory_id: factoryId, sale_id: row.saleId ?? null, lot_id: row.lotId ?? null,
    action: row.action, detail: row.detail, reason: row.reason ?? null, actor: row.actor,
    confidence_shown: row.confidenceShown != null ? row.confidenceShown.toFixed(4) : null,
    weight_delta: row.weightDelta != null ? row.weightDelta.toFixed(2) : null,
  });
}

// Resolve (or create) a dispatch by sale number for the report-analyser auto flow.
export async function resolveSale(
  supabase: Supa,
  factoryId: string,
  saleNo: string | null,
): Promise<string | null> {
  const sn = saleNo?.trim();
  if (!sn) return null;
  const { data: existing } = await supabase
    .from("auction_sales")
    .select("id")
    .eq("sale_no", sn)
    .eq("factory_id", factoryId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: br } = await supabase.from("brokers").select("id").eq("factory_id", factoryId).limit(1).single();
  if (!br?.id) return null;
  const { data: created } = await supabase
    .from("auction_sales")
    .insert({ factory_id: factoryId, broker_id: br.id, sale_no: sn, status: "dispatched" })
    .select("id")
    .single();
  return (created?.id as string) ?? null;
}

// Stage a bank CSV and (re)write its transactions, keyed to the doc_import id.
// The review page reads bank_txns by import_batch_id = importId, so keying on the
// doc_import id is what makes them visible — and makes a re-upload replace the
// previous batch instead of leaving orphaned duplicates. Optionally auto-matches.
export async function stageBankCsv(
  supabase: Supa,
  factoryId: string,
  saleId: string,
  file: File,
  text: string,
  autoMatch: boolean,
): Promise<{ importId: string; count: number } | { error: string }> {
  const parsed = parseBankCsv(text);
  const importId = await stageImport(supabase, factoryId, saleId, "bank_csv", file.name, text, parsed);
  if (!importId) return { error: "Could not stage the CSV." };

  await supabase.from("bank_txns").delete().eq("import_batch_id", importId);
  const { error: insErr } = await supabase.from("bank_txns").insert(
    parsed.transactions.map((t) => ({
      factory_id: factoryId,
      txn_date: t.txnDate,
      description: t.description,
      debit: t.debit.toFixed(2),
      credit: t.credit.toFixed(2),
      running_balance: t.runningBalance?.toFixed(2) ?? null,
      cheque_no: t.chequeNo,
      raw_line: t.rawLine,
      import_batch_id: importId,
    })),
  );
  if (insErr) return { error: insErr.message };

  if (autoMatch) await autoMatchBank(supabase, saleId, importId);
  return { importId, count: parsed.transactions.length };
}

// Reconcile a batch's still-unmatched credits against the sale's settlements and
// apply the high-confidence matches. Returns how many were applied. Shared by the
// ingest path and the "apply suggested matches" action.
export async function autoMatchBank(supabase: Supa, saleId: string, importId: string): Promise<number> {
  const { data: settlements } = await supabase
    .from("settlements")
    .select("id, contract_no, total_net_proceeds, prompt_date")
    .eq("sale_id", saleId);
  const { data: credits } = await supabase
    .from("bank_txns")
    .select("id, txn_date, credit, description, cheque_no")
    .eq("import_batch_id", importId)
    .is("matched_settlement_id", null);
  if (!settlements?.length || !credits?.length) return 0;
  const { data: vatForSale } = await supabase
    .from("sale_lines")
    .select("vat_amount, on_guarantee")
    .eq("sale_id", saleId);
  const guaranteedVat = (vatForSale ?? []).filter((v) => v.on_guarantee).reduce((s, v) => s + Number(v.vat_amount ?? 0), 0);
  const recon = reconcileBank(
    settlements.map((st) => ({
      settlementId: st.id as string,
      contractNo: st.contract_no as string,
      totalNetProceeds: Number(st.total_net_proceeds),
      guaranteedVat,
      promptDate: (st.prompt_date as string) ?? "",
    })),
    credits.map((c) => ({
      txnId: c.id as string,
      txnDate: c.txn_date as string,
      credit: Number(c.credit),
      description: (c.description as string) ?? "",
      chequeNo: c.cheque_no as string | null,
    })),
  );
  await Promise.all(
    recon.matches.map((m) =>
      supabase.from("bank_txns").update({ matched_settlement_id: m.settlementId, match_status: "matched" }).eq("id", m.bankTxnId),
    ),
  );
  return recon.matches.length;
}
