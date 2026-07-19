// Shared, non-action helpers for the auction server actions. This module is NOT
// "use server" — a server-action file may only export async actions, so every
// sync helper, type, and DB utility that more than one action file needs lives
// here and is imported by the concern-specific files in this folder.
import { createHash } from "crypto";
import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import { parseBankCsv, reconcileBank } from "@tea/api";
import { requireProfile } from "@/lib/profile";
import { friendlyError } from "@/lib/errors";
import { formatFourDigitNo, formatSaleNo, saleNoKey } from "../sale-number";

export const AUC = "/dashboard/auction";
export const REP = "/dashboard/auction/reports";
export const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
export const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());
export const back = (path: string, error: string): never => redirect(`${path}?error=${encodeURIComponent(error)}`);

/** Today's calendar date at the factory, independent of the browser's timezone. */
export function colomboToday(now = new Date()): string {
  const values = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).reduce<Record<string, string>>((parts, part) => {
    parts[part.type] = part.value;
    return parts;
  }, {});
  return `${values.year}-${values.month}-${values.day}`;
}

export type Supa = Awaited<ReturnType<typeof requireProfile>>["supabase"];
export type DocType = "grn" | "acknowledgement" | "valuation" | "contract" | "bank_csv";
export type StageImportResult =
  | { ok: true; importId: string }
  | { ok: false; error: string };
export type BankMatchResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export const gradeAliasKey = (value: string | null | undefined) =>
  String(value ?? "").toUpperCase().replace(/\s+/g, "");

export async function gradeAliasMap(supabase: Supa, factoryId: string): Promise<Map<string, string>> {
  const [{ data: grades }, { data: aliases }] = await Promise.all([
    supabase.from("auction_grades").select("id, code, name").eq("factory_id", factoryId),
    supabase.from("auction_grade_aliases").select("grade_id, alias").eq("factory_id", factoryId),
  ]);
  const canonicalById = new Map<string, string>();
  const map = new Map<string, string>();

  for (const grade of (grades ?? []) as { id: string; code: string; name: string | null }[]) {
    canonicalById.set(grade.id, grade.code);
    map.set(gradeAliasKey(grade.code), grade.code);
    map.set(gradeAliasKey(grade.name), grade.code);
  }

  for (const alias of (aliases ?? []) as { grade_id: string; alias: string }[]) {
    const canonical = canonicalById.get(alias.grade_id);
    if (canonical) map.set(gradeAliasKey(alias.alias), canonical);
  }

  return map;
}

export function canonicalGrade(value: string, aliases: Map<string, string>): string {
  return aliases.get(gradeAliasKey(value)) ?? value;
}

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
// The hash is computed from the RAW file bytes, not the extracted text —
// PDF text extraction can vary across runs (whitespace, line breaks), so
// hashing bytes is the reliable dedupe key for re-uploads of the same file.
export async function stageImport(
  supabase: Supa,
  factoryId: string,
  saleId: string,
  docType: DocType,
  file: File,
  parsed: unknown,
  storagePath?: string | null,
): Promise<StageImportResult> {
  // `saleId` is browser-controlled at every upload entry point. Resolve it
  // through the tenant-scoped client before persisting a document relationship.
  const { data: sale, error: saleError } = await supabase
    .from("auction_sales")
    .select("id")
    .eq("id", saleId)
    .eq("factory_id", factoryId)
    .maybeSingle();
  if (saleError) return { ok: false, error: friendlyError(saleError) };
  if (!sale) return { ok: false, error: "The selected Broker Invoice was not found for this factory." };

  const filename = file.name;
  const contentHash = createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex");
  const { data: existing, error: existingError } = await supabase
    .from("doc_imports")
    .select("id")
    .eq("factory_id", factoryId)
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (existingError) return { ok: false, error: friendlyError(existingError) };
  if (existing?.id) {
    const { data: updated, error: updateError } = await supabase
      .from("doc_imports")
      .update({ parsed_json: parsed, status: "parsed", sale_id: saleId, source_filename: filename, storage_path: storagePath ?? null, doc_type: docType })
      .eq("id", existing.id)
      .eq("factory_id", factoryId)
      .select("id")
      .maybeSingle();
    if (updateError) return { ok: false, error: friendlyError(updateError) };
    if (!updated) return { ok: false, error: "The existing import could not be updated. Refresh and try again." };
    return { ok: true, importId: updated.id as string };
  }
  const { data, error: insertError } = await supabase
    .from("doc_imports")
    .insert({
      factory_id: factoryId,
      doc_type: docType,
      source_filename: filename,
      storage_path: storagePath ?? null,
      content_hash: contentHash,
      parsed_json: parsed,
      status: "parsed",
      sale_id: saleId,
    })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: friendlyError(insertError) };
  if (!data?.id) return { ok: false, error: "The import could not be staged. Refresh and try again." };
  return { ok: true, importId: data.id as string };
}

export async function writeAudit(supabase: Supa, factoryId: string, row: {
  saleId?: string | null; lotId?: string | null; action: string; detail: string;
  reason?: string | null; actor: string; confidenceShown?: number | null; weightDelta?: number | null;
}) {
  return supabase.from("auction_audit").insert({
    factory_id: factoryId, sale_id: row.saleId ?? null, lot_id: row.lotId ?? null,
    action: row.action, detail: row.detail, reason: row.reason ?? null, actor: row.actor,
    confidence_shown: row.confidenceShown != null ? row.confidenceShown.toFixed(4) : null,
    weight_delta: row.weightDelta != null ? row.weightDelta.toFixed(2) : null,
  });
}

// Find an existing dispatch whose sale_no OR target_sale_no matches saleNo (by
// normalized key). Optionally scoped to a broker. Returns null if none match.
export async function findSaleId(
  supabase: Supa,
  factoryId: string,
  saleNo: string | null,
  brokerId?: string,
): Promise<string | null> {
  const key = saleNoKey(saleNo);
  if (!key) return null;
  let q = supabase
    .from("auction_sales")
    .select("id, sale_no, target_sale_no")
    .eq("factory_id", factoryId);
  if (brokerId) q = q.eq("broker_id", brokerId);
  const { data } = await q;
  const match = (data ?? []).find(
    (c) => saleNoKey(c.sale_no as string) === key || saleNoKey(c.target_sale_no as string) === key,
  );
  return (match?.id as string) ?? null;
}

// All dispatches that belong to the same auction sale + broker as the given
// dispatch. A broker sends ONE acknowledgement/valuation/contract per sale, but
// the factory may have split that sale across several dispatches — document
// reconciliation must see the whole group, or lots living on a sibling dispatch
// get misread as "unexpected" and duplicated onto the dispatch being reviewed.
// Sale identity follows the sales pages' convention: target_sale_no || sale_no,
// compared by normalized key. Always contains the given saleId itself.
export async function saleGroupIds(supabase: Supa, factoryId: string, saleId: string): Promise<string[]> {
  const { data: current } = await supabase
    .from("auction_sales")
    .select("id, broker_id, sale_no, target_sale_no")
    .eq("id", saleId)
    .eq("factory_id", factoryId)
    .maybeSingle();
  if (!current) return [saleId];
  const key = (current.target_sale_no as string | null) || (current.sale_no as string);
  const { data: siblings } = await supabase
    .from("auction_sales")
    .select("id, sale_no, target_sale_no")
    .eq("factory_id", factoryId)
    .eq("sale_kind", "dispatch")
    .eq("broker_id", current.broker_id as string);
  const ids = (siblings ?? [])
    .filter((s) => saleNoKey(((s.target_sale_no as string | null) || (s.sale_no as string))) === saleNoKey(key))
    .map((s) => s.id as string);
  return ids.includes(saleId) ? ids : [saleId, ...ids];
}

export async function saleDetailPath(supabase: Supa, factoryId: string, saleId: string): Promise<string> {
  const { data: sale } = await supabase
    .from("auction_sales")
    .select("sale_no, target_sale_no")
    .eq("id", saleId)
    .eq("factory_id", factoryId)
    .maybeSingle();
  const key = saleNoKey((sale?.target_sale_no as string | null) || (sale?.sale_no as string | null));
  return `${AUC}/sales/${encodeURIComponent(key || saleId)}`;
}

export async function nextDispatchNo(supabase: Supa): Promise<string> {
  const { data } = await supabase.from("auction_sales").select("sale_no").eq("sale_kind", "dispatch");
  const maxNo = (data ?? []).reduce((max, row) => {
    const match = (row.sale_no as string | null)?.match(/\d+$/);
    return match ? Math.max(max, Number(match[0])) : max;
  }, 0);
  return formatFourDigitNo(maxNo + 1);
}

// Resolve (or create) a dispatch by sale number for the report-analyser auto flow.
// Matches an existing dispatch on either the dispatch number or the auction sale
// number (normalized) before creating, so re-uploading documents for a sale that
// already has a dispatch attaches to it instead of spawning a duplicate.
export async function resolveSale(
  supabase: Supa,
  factoryId: string,
  saleNo: string | null,
): Promise<string | null> {
  const sn = formatSaleNo(saleNo);
  if (!sn) return null;
  const existingId = await findSaleId(supabase, factoryId, sn);
  if (existingId) return existingId;
  const { data: br } = await supabase.from("brokers").select("id").eq("factory_id", factoryId).limit(1).single();
  if (!br?.id) return null;
  const dispatchNo = await nextDispatchNo(supabase);
  const { data: created } = await supabase
    .from("auction_sales")
    .insert({ factory_id: factoryId, broker_id: br.id, sale_no: dispatchNo, target_sale_no: sn, status: "draft" })
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
  const staged = await stageImport(supabase, factoryId, saleId, "bank_csv", file, parsed);
  if (!staged.ok) return { error: staged.error };
  const importId = staged.importId;

  const { error: cleanupError } = await supabase
    .from("bank_txns")
    .delete()
    .eq("import_batch_id", importId)
    .eq("factory_id", factoryId);
  if (cleanupError) return { error: friendlyError(cleanupError) };
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
  if (insErr) return { error: friendlyError(insErr) };

  if (autoMatch) {
    const matched = await autoMatchBank(supabase, saleId, importId);
    if (!matched.ok) return { error: matched.error };
  }
  return { importId, count: parsed.transactions.length };
}

// Reconcile a batch's still-unmatched credits against the sale's settlements and
// apply the high-confidence matches. Returns how many were applied. Shared by the
// ingest path and the "apply suggested matches" action.
export async function autoMatchBank(supabase: Supa, saleId: string, importId: string): Promise<BankMatchResult> {
  const { data: bankImport, error: importError } = await supabase
    .from("doc_imports")
    .select("id")
    .eq("id", importId)
    .eq("sale_id", saleId)
    .eq("doc_type", "bank_csv")
    .maybeSingle();
  if (importError) return { ok: false, error: friendlyError(importError) };
  if (!bankImport) return { ok: false, error: "This bank import does not belong to the selected sale." };

  const { data: settlements, error: settlementError } = await supabase
    .from("settlements")
    .select("id, contract_no, total_net_proceeds, prompt_date")
    .eq("sale_id", saleId);
  if (settlementError) return { ok: false, error: friendlyError(settlementError) };
  const { data: credits, error: creditError } = await supabase
    .from("bank_txns")
    .select("id, txn_date, credit, description, cheque_no")
    .eq("import_batch_id", importId)
    .is("matched_settlement_id", null);
  if (creditError) return { ok: false, error: friendlyError(creditError) };
  if (!settlements?.length || !credits?.length) return { ok: true, count: 0 };
  const { data: vatForSale, error: vatError } = await supabase
    .from("sale_lines")
    .select("vat_amount, on_guarantee")
    .eq("sale_id", saleId);
  if (vatError) return { ok: false, error: friendlyError(vatError) };
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
  const applied: { bankTxnId: string; settlementId: string }[] = [];
  for (const match of recon.matches) {
    const { data: updated, error: updateError } = await supabase
      .from("bank_txns")
      .update({ matched_settlement_id: match.settlementId, match_status: "matched" })
      .eq("id", match.bankTxnId)
      .eq("import_batch_id", importId)
      .is("matched_settlement_id", null)
      .select("id")
      .maybeSingle();
    if (updateError || !updated) {
      // Best-effort compensation keeps the batch from looking partly applied
      // when one credit changes concurrently or a write is rejected.
      for (const previous of applied) {
        await supabase
          .from("bank_txns")
          .update({ matched_settlement_id: null, match_status: "unmatched" })
          .eq("id", previous.bankTxnId)
          .eq("import_batch_id", importId)
          .eq("matched_settlement_id", previous.settlementId);
      }
      return {
        ok: false,
        error: updateError
          ? friendlyError(updateError)
          : "A suggested credit changed before all matches could be applied. Refresh and review the batch.",
      };
    }
    applied.push({ bankTxnId: match.bankTxnId, settlementId: match.settlementId });
  }
  return { ok: true, count: applied.length };
}
