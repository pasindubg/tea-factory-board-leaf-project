"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isAcknowledgement,
  parseAcknowledgement,
  reconcileAcknowledgement,
  isValuation,
  parseValuation,
  isContract,
  parseContract,
  computeSettlement,
  reconcileVat,
  type ParsedAcknowledgement,
  type ParsedValuation,
  type ParsedContract,
} from "@tea/api";
import { requireModuleAccess } from "@/lib/profile";
import {
  AUC,
  back,
  canonicalGrade,
  extractPdf,
  gradeAliasMap,
  stageImport,
  toISODate,
  saleGroupIds,
  saleDetailPath,
  writeAudit,
} from "./_shared";
import { buildInvoicedLots } from "../recon-helpers";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";

type CarryForwardLot = {
  id: string;
  sale_id: string;
  invoice_no: string | null;
  lot_no: string | null;
  bags: number | null;
  kg_per_bag: number | string | null;
  gross_wt: number | string | null;
  sample_allowance: number | string | null;
  net_wt: number | string | null;
  state: string | null;
  auction_sales: {
    broker_id: string;
    sale_no: string | null;
    target_sale_no: string | null;
    dispatch_date: string | null;
  } | null;
  lot_invoices?: { invoice_no: string }[] | null;
};

const CARRY_FORWARD_BLOCKED_STATES = new Set(["sold", "settled"]);

function invoiceKeys(row: { invoice_no?: string | null; lot_invoices?: { invoice_no: string | null }[] | null }) {
  return [
    formatFourDigitNo(row.invoice_no ?? null),
    ...((row.lot_invoices ?? []).map((invoice) => formatFourDigitNo(invoice.invoice_no)).filter(Boolean)),
  ].filter(Boolean);
}

// ---------- Acknowledgement (① catalogue & reconcile) ----------
export async function ingestAcknowledgement(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  const reviewBase = `${AUC}/${saleId}`;
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (text === null) return back(detail, "Choose a valid Acknowledgement PDF to upload.");
  if (!isAcknowledgement(text)) return back(detail, "That doesn't look like an Acknowledgement document.");
  const parsed = parseAcknowledgement(text);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "acknowledgement", file as File, parsed);
  if (!importId) return back(detail, "Could not stage the document.");
  redirect(`${reviewBase}/ack/${importId}`);
}

export async function confirmAcknowledgement(importId: string, saleId: string) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  const { data: imp } = await supabase
    .from("doc_imports")
    .select("id, parsed_json")
    .eq("id", importId)
    .single();
  if (!imp?.parsed_json) return back(detail, "Staged import not found.");
  const rawParsed = imp.parsed_json as ParsedAcknowledgement;
  const aliases = await gradeAliasMap(supabase, profile.factory_id);
  const parsed: ParsedAcknowledgement = {
    ...rawParsed,
    lots: rawParsed.lots.map((lot) => ({
      ...lot,
      invoiceNo: formatFourDigitNo(lot.invoiceNo),
      lotNo: formatFourDigitNo(lot.lotNo) || null,
      grade: canonicalGrade(lot.grade, aliases),
    })),
  };

  // The ack covers the whole sale for this broker — the factory may have split
  // that sale across several dispatches, so reconcile against ALL of them.
  const groupIds = await saleGroupIds(supabase, profile.factory_id, saleId);
  const { data: groupSales } = await supabase
    .from("auction_sales")
    .select("id, broker_id, sale_no, target_sale_no, dispatch_date")
    .in("id", groupIds);
  const saleIdByDispatchDate = new Map(
    (groupSales ?? [])
      .filter((sale) => sale.dispatch_date)
      .map((sale) => [sale.dispatch_date as string, sale.id as string]),
  );
  const currentBrokerId = (groupSales ?? [])[0]?.broker_id as string | undefined;
  const dispatchNoBySaleId = new Map((groupSales ?? []).map((sale) => [sale.id as string, sale.sale_no as string | null]));
  const { data: lotRows } = await supabase
    .from("auction_lots")
    .select("id, sale_id, invoice_no, grade, net_wt, lot_invoices(invoice_no)")
    .in("sale_id", groupIds);
  const invoiced = buildInvoicedLots((lotRows ?? []) as unknown as Parameters<typeof buildInvoicedLots>[0]);
  const recon = reconcileAcknowledgement(invoiced, parsed);

  // Resolve marks by code OR name (Asia Siyaka acks print only the mark name),
  // auto-creating any the ack references but the factory hasn't registered yet.
  const markCodes = [...new Set(parsed.lots.map((l) => l.markCode))];
  const { data: existingMarks } = await supabase.from("marks").select("id, code, name");
  const markByCode = new Map<string, string>();
  for (const m of existingMarks ?? []) {
    markByCode.set((m.code as string).toUpperCase(), m.id as string);
    if (m.name) markByCode.set((m.name as string).toUpperCase(), m.id as string);
  }
  const newCodes = markCodes.filter((code) => !markByCode.has(code.toUpperCase()));
  if (newCodes.length > 0) {
    const { data: created } = await supabase
      .from("marks")
      .insert(newCodes.map((code) => ({
        factory_id: profile.factory_id,
        code,
        name: parsed.lots.find((l) => l.markCode === code)?.markName ?? code,
      })))
      .select("id, code");
    for (const m of created ?? []) markByCode.set((m.code as string).toUpperCase(), m.id as string);
  }

  // Apply acknowledgement to every matched invoiced lot (in parallel — each touches a
  // distinct lot, then the sweep below moves whatever's left).
  await Promise.all(
    recon.rows
      .filter((row) => row.invoiced && (row.status === "catalogued" || row.status === "shutout"))
      .map((row) =>
        supabase
          .from("auction_lots")
          .update({
            lot_no: row.ack?.lotNo ?? null,
            mark_id: row.ack ? markByCode.get(row.ack.markCode.toUpperCase()) ?? null : null,
            state: row.status === "catalogued" ? "acknowledged" : "shutout",
            shutout_reason:
              row.status === "shutout" ? "Listed under Shutout/Violation in the acknowledgement" : null,
          })
          .eq("id", row.invoiced!.id),
      ),
  );

  const unexpectedAckEntries = recon.rows
    .filter((row) => row.status === "unexpected" && row.ack)
    .map((row) => {
      const ackLot = parsed.lots.find((lot) => lot.invoiceNo === row.invoiceNo && lot.lotNo === row.ack?.lotNo);
      if (!ackLot) return null;
      const ackDispatchDate = toISODate(ackLot.dispatchDate);
      const targetSaleId = (ackDispatchDate ? saleIdByDispatchDate.get(ackDispatchDate) : null) ?? saleId;
      return {
        ackLot,
        factory_id: profile.factory_id,
        sale_id: targetSaleId,
        mark_id: markByCode.get(ackLot.markCode.toUpperCase()) ?? null,
        invoice_no: formatFourDigitNo(ackLot.invoiceNo),
        provisional_sale_no: formatSaleNo(parsed.saleNo),
        lot_no: formatFourDigitNo(ackLot.lotNo) || null,
        grade: ackLot.grade,
        bags: ackLot.bags,
        kg_per_bag: ackLot.kgPerBag,
        net_wt: ackLot.netWt,
        lot_source: "acknowledgement",
        state: ackLot.section === "catalogued" ? "acknowledged" : "shutout",
        shutout_reason:
          ackLot.section === "shutout" ? "Listed under Shutout/Violation in the acknowledgement" : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const unexpectedInvoiceNos = [...new Set(unexpectedAckEntries.map((row) => row.invoice_no))];
  const unexpectedLotNos = [...new Set(unexpectedAckEntries.map((row) => row.lot_no).filter((lotNo): lotNo is string => Boolean(lotNo)))];
  // A broker can catalogue the same invoice/lot again in a later sale. Before
  // creating an ACK-sourced "unexpected" lot, move the existing unsold lot
  // forward so invoice history stays on one lot id.
  const { data: linkedInvoiceLots } = unexpectedInvoiceNos.length > 0
    ? await supabase
        .from("lot_invoices")
        .select("lot_id, invoice_no")
        .eq("factory_id", profile.factory_id)
        .in("invoice_no", unexpectedInvoiceNos)
    : { data: [] };
  const linkedLotIds = [...new Set((linkedInvoiceLots ?? []).map((row) => row.lot_id as string))];
  const carryForwardParts: string[] = [];
  if (unexpectedInvoiceNos.length > 0) carryForwardParts.push(`invoice_no.in.(${unexpectedInvoiceNos.join(",")})`);
  if (unexpectedLotNos.length > 0) carryForwardParts.push(`lot_no.in.(${unexpectedLotNos.join(",")})`);
  if (linkedLotIds.length > 0) carryForwardParts.push(`id.in.(${linkedLotIds.join(",")})`);
  const { data: carryForwardRows } = carryForwardParts.length > 0
    ? await supabase
        .from("auction_lots")
        .select("id, sale_id, invoice_no, lot_no, bags, kg_per_bag, gross_wt, sample_allowance, net_wt, state, auction_sales(broker_id, sale_no, target_sale_no, dispatch_date), lot_invoices(invoice_no)")
        .eq("factory_id", profile.factory_id)
        .or(carryForwardParts.join(","))
    : { data: [] };
  const carryForwardCandidates = ((carryForwardRows ?? []) as unknown as CarryForwardLot[]).filter((lot) => {
    if (groupIds.includes(lot.sale_id)) return false;
    if (currentBrokerId && lot.auction_sales?.broker_id !== currentBrokerId) return false;
    return true;
  });
  const { data: existingSaleLines } = carryForwardCandidates.length > 0
    ? await supabase
        .from("sale_lines")
        .select("lot_id")
        .in("lot_id", carryForwardCandidates.map((lot) => lot.id))
    : { data: [] };
  const soldLotIds = new Set((existingSaleLines ?? []).map((line) => line.lot_id as string));
  const movableLots = carryForwardCandidates.filter((lot) => !CARRY_FORWARD_BLOCKED_STATES.has(lot.state ?? "") && !soldLotIds.has(lot.id));
  const usedCarryForwardLotIds = new Set<string>();
  const rowsToCreate = [];
  const movedLotsFromAck: { id: string; sale_id: string; state: string }[] = [];

  for (const row of unexpectedAckEntries) {
    const matchingCarryForwardLots = carryForwardCandidates
      .filter((lot) => {
        if (usedCarryForwardLotIds.has(lot.id)) return false;
        const invoiceMatches =
          formatFourDigitNo(lot.invoice_no) === row.invoice_no ||
          (lot.lot_invoices ?? []).some((invoice) => formatFourDigitNo(invoice.invoice_no) === row.invoice_no);
        const lotMatches = row.lot_no && formatFourDigitNo(lot.lot_no) === row.lot_no;
        return invoiceMatches || lotMatches;
      })
      .sort((a, b) => String(b.auction_sales?.dispatch_date ?? "").localeCompare(String(a.auction_sales?.dispatch_date ?? "")));
    const candidate = matchingCarryForwardLots.find((lot) => movableLots.some((movable) => movable.id === lot.id));

    if (!candidate) {
      if (matchingCarryForwardLots.length > 0) {
        const blocked = matchingCarryForwardLots[0];
        const blockedDispatch = formatFourDigitNo(blocked.auction_sales?.sale_no) || "—";
        back(detail, `Invoice ${row.invoice_no} already belongs to a sold/settled lot on broker invoice ${blockedDispatch}; it cannot be rolled forward automatically.`);
      }
      rowsToCreate.push(row);
      continue;
    }

    usedCarryForwardLotIds.add(candidate.id);
    if (candidate.state === "re-print") {
      rowsToCreate.push({
        ...row,
        bags: candidate.bags ?? row.bags,
        kg_per_bag: candidate.kg_per_bag ?? row.kg_per_bag,
        gross_wt: candidate.gross_wt,
        sample_allowance: candidate.sample_allowance,
        net_wt: candidate.net_wt ?? row.net_wt,
        reprint_source_lot_id: candidate.id,
      });
      await writeAudit(supabase, profile.factory_id, {
        saleId: row.sale_id,
        lotId: candidate.id,
        action: "Re-print acknowledged",
        detail: `Invoice ${row.invoice_no} was found again by acknowledgement and added to the new sale as a re-print child lot.`,
        reason: `ACK sale ${parsed.saleNo ?? "—"} listed this invoice again${row.ackLot.dispatchDate ? ` on ${row.ackLot.dispatchDate}` : ""}.`,
        actor: profile.name,
      });
      continue;
    }

    const patch = {
      sale_id: row.sale_id,
      mark_id: row.mark_id,
      invoice_no: row.invoice_no,
      lot_no: row.lot_no,
      grade: row.grade,
      bags: row.bags,
      kg_per_bag: row.kg_per_bag,
      net_wt: row.net_wt,
      state: row.state,
      shutout_reason: row.shutout_reason,
    };
    await supabase.from("auction_lots").update(patch).eq("id", candidate.id);

    if (!(candidate.lot_invoices ?? []).some((invoice) => formatFourDigitNo(invoice.invoice_no) === row.invoice_no)) {
      await supabase.from("lot_invoices").insert({
        factory_id: profile.factory_id,
        lot_id: candidate.id,
        invoice_no: row.invoice_no,
      });
    }

    movedLotsFromAck.push({ id: candidate.id, sale_id: row.sale_id, state: row.state });
    const fromDispatch = formatFourDigitNo(candidate.auction_sales?.sale_no) || "—";
    const toDispatch = formatFourDigitNo(dispatchNoBySaleId.get(row.sale_id)) || "—";
    await writeAudit(supabase, profile.factory_id, {
      saleId: row.sale_id,
      lotId: candidate.id,
      action: "Rolled forward",
      detail: `Invoice ${row.invoice_no} moved from broker invoice ${fromDispatch} to ${toDispatch} by later acknowledgement.`,
      reason: `ACK sale ${parsed.saleNo ?? "—"} listed this invoice again${row.ackLot.dispatchDate ? ` on ${row.ackLot.dispatchDate}` : ""}.`,
      actor: profile.name,
    });
  }

  let createdLotsFromAck: { id: string; sale_id: string; invoice_no: string; state: string }[] = [];
  if (rowsToCreate.length > 0) {
    const { data: createdLots } = await supabase
      .from("auction_lots")
      .insert(rowsToCreate.map(({ ackLot: _ackLot, ...row }) => row))
      .select("id, sale_id, invoice_no, state");
    if (createdLots && createdLots.length > 0) {
      createdLotsFromAck = createdLots as { id: string; sale_id: string; invoice_no: string; state: string }[];
      await supabase.from("lot_invoices").insert(
        createdLots.map((lot) => ({
          factory_id: profile.factory_id,
          lot_id: lot.id,
          invoice_no: formatFourDigitNo(lot.invoice_no as string),
        })),
      );
    }
  }

  // Remaining invoiced lots not in this ack → pending (may be in a later ack).
  // Group-wide: the ack is the broker's full statement for this sale.
  await supabase.from("auction_lots").update({ state: "pending" }).in("sale_id", groupIds).eq("state", "invoiced");

  await supabase
    .from("doc_imports")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", importId);
  // Flip every dispatch in the group that had lots acknowledged — but never
  // regress one that has already moved past cataloguing.
  const saleIdByLot = new Map((lotRows ?? []).map((l) => [l.id as string, l.sale_id as string]));
  const affectedSales = new Set<string>();
  for (const row of recon.rows) {
    if (row.invoiced && row.status === "catalogued") {
      const sid = saleIdByLot.get(row.invoiced.id);
      if (sid) affectedSales.add(sid);
    }
  }
  for (const lot of createdLotsFromAck) {
    if (lot.state === "acknowledged") affectedSales.add(lot.sale_id as string);
  }
  for (const lot of movedLotsFromAck) {
    if (lot.state === "acknowledged") affectedSales.add(lot.sale_id);
  }
  if (affectedSales.size > 0) {
    await supabase
      .from("auction_sales")
      .update({ status: "catalogued" })
      .in("id", [...affectedSales])
    .in("status", ["draft", "dispatched", "invoiced", "grn"]);
  }
  revalidatePath(detail);
  const movedNotice = movedLotsFromAck.length > 0 ? ` ${movedLotsFromAck.length} lot(s) rolled forward.` : "";
  redirect(
    `${detail}?notice=${encodeURIComponent(`Acknowledged ${recon.summary.catalogued} lot(s); ${recon.summary.shutout} shutout.${movedNotice}`)}`,
  );
}

export async function rejectAcknowledgement(importId: string, saleId: string) {
  const { supabase, profile } = await requireModuleAccess("auction");
  await supabase.from("doc_imports").update({ status: "rejected" }).eq("id", importId);
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  revalidatePath(detail);
  redirect(detail);
}

// ---------- Valuation (② valuation ↔ realised) ----------
export async function ingestValuation(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  const reviewBase = `${AUC}/${saleId}`;
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (text === null) return back(detail, "Choose a valid Valuation PDF to upload.");
  if (!isValuation(text)) return back(detail, "That doesn't look like a Valuation Report.");
  const parsed = parseValuation(text);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "valuation", file as File, parsed);
  if (!importId) return back(detail, "Could not stage the document.");
  redirect(`${reviewBase}/valuation/${importId}`);
}

export async function confirmValuation(importId: string, saleId: string) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  const { data: imp } = await supabase.from("doc_imports").select("parsed_json").eq("id", importId).single();
  if (!imp?.parsed_json) return back(detail, "Staged import not found.");
  const rawParsed = imp.parsed_json as ParsedValuation;
  const aliases = await gradeAliasMap(supabase, profile.factory_id);
  const parsed: ParsedValuation = {
    ...rawParsed,
    lots: rawParsed.lots.map((lot) => ({
      ...lot,
      invoiceNo: formatFourDigitNo(lot.invoiceNo),
      lotNo: formatFourDigitNo(lot.lotNo),
      grade: canonicalGrade(lot.grade, aliases),
    })),
  };

  const reportSaleNo = formatSaleNo(parsed.saleNo);
  if (!reportSaleNo) return back(detail, "The valuation report does not contain a sale number.");
  const { data: resultRows, error } = await supabase.rpc("confirm_auction_valuation", {
    p_import_id: importId,
    p_broker_invoice_id: saleId,
    p_sale_no: reportSaleNo,
    p_parsed: parsed,
  });
  if (error) return back(detail, `Could not confirm valuation: ${error.message}`);
  const result = (Array.isArray(resultRows) ? resultRows[0] : resultRows) as {
    matched_count?: number;
    not_valued_count?: number;
    reassigned_count?: number;
  } | null;
  const applied = Number(result?.matched_count ?? 0);
  const notValued = Number(result?.not_valued_count ?? 0);
  const reassigned = Number(result?.reassigned_count ?? 0);
  revalidatePath(detail);
  revalidatePath(`${AUC}/sales`);
  redirect(`${detail}?notice=${encodeURIComponent(`Recorded ${applied} valuation(s); ${notValued} invoice(s) marked Not Valued; ${reassigned} reassigned to sale ${reportSaleNo}.`)}`);
}

// ---------- Sellers Contract (sale lines, settlements, VAT — A3) ----------
export async function ingestContract(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  const reviewBase = `${AUC}/${saleId}`;
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (text === null) return back(detail, "Choose a valid Sellers Contract PDF to upload.");
  if (!isContract(text)) return back(detail, "That doesn't look like a Sellers Contract & Account Sales document.");
  const parsed = parseContract(text);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "contract", file as File, parsed);
  if (!importId) return back(detail, "Could not stage the document.");
  redirect(`${reviewBase}/contract/${importId}`);
}

export async function confirmContract(importId: string, saleId: string) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  const { data: imp } = await supabase.from("doc_imports").select("parsed_json").eq("id", importId).single();
  if (!imp?.parsed_json) return back(detail, "Staged import not found.");
  const rawParsed = imp.parsed_json as ParsedContract;
  const aliases = await gradeAliasMap(supabase, profile.factory_id);
  const parsed: ParsedContract = {
    ...rawParsed,
    lines: rawParsed.lines.map((line) => ({
      ...line,
      lotNo: formatFourDigitNo(line.lotNo),
      invoiceNo: formatFourDigitNo(line.invoiceNo),
      grade: canonicalGrade(line.grade, aliases),
    })),
  };

  // The sellers contract covers the broker's whole sale — match lots across all
  // dispatches in the sale group, and file each sale line under its lot's own dispatch.
  const groupIds = await saleGroupIds(supabase, profile.factory_id, saleId);
  const { data: lotRows } = await supabase
    .from("auction_lots")
    .select("id, sale_id, invoice_no, bags, kg_per_bag, gross_wt, sample_allowance, net_wt, state, lot_invoices(invoice_no)")
    .in("sale_id", groupIds);
  type ContractLot = {
    id: string;
    sale_id: string;
    invoice_no: string | null;
    bags: number | null;
    kg_per_bag: number | string | null;
    gross_wt: number | string | null;
    sample_allowance: number | string | null;
    net_wt: number | string | null;
    state: string;
    lot_invoices?: { invoice_no: string | null }[] | null;
  };
  const contractLots = (lotRows ?? []) as ContractLot[];
  const lotByInv = new Map<string, ContractLot>();
  for (const lot of contractLots) {
    for (const invoiceNo of invoiceKeys(lot)) {
      lotByInv.set(invoiceNo, lot);
    }
  }

  // NOT SOLD is the broker's re-print instruction. Add one more sampling
  // cycle to the original lot, preserve it as history, and wait for a later ACK
  // to create the linked child. The audit guard prevents double deduction when
  // a confirmed contract is re-run.
  const notSoldMatches = parsed.lines
    .filter((line) => line.sold === false && lotByInv.has(line.invoiceNo))
    .map((line) => ({ line, lot: lotByInv.get(line.invoiceNo)! }));
  const notSoldLotIds = [...new Set(notSoldMatches.map(({ lot }) => lot.id))];
  const reprintAuditAction = "Contract not sold re-print";
  const { data: priorReprintAudits } = notSoldLotIds.length > 0
    ? await supabase.from("auction_audit").select("lot_id").in("lot_id", notSoldLotIds).eq("action", reprintAuditAction)
    : { data: [] };
  const alreadyApplied = new Set((priorReprintAudits ?? []).map((row) => row.lot_id as string));

  if (notSoldLotIds.length > 0) {
    const { data: staleSaleLines } = await supabase.from("sale_lines").select("id").in("lot_id", notSoldLotIds);
    const staleSaleLineIds = (staleSaleLines ?? []).map((row) => row.id as string);
    if (staleSaleLineIds.length > 0) {
      await supabase.from("vat_ledger").delete().in("sale_line_id", staleSaleLineIds);
      await supabase.from("sale_lines").delete().in("id", staleSaleLineIds);
    }
  }

  for (const { line, lot } of notSoldMatches) {
    if (alreadyApplied.has(lot.id)) {
      await supabase.from("auction_lots").update({ state: "re-print" }).eq("id", lot.id);
      continue;
    }
    const existingSample = Math.max(0, Number(lot.sample_allowance ?? 0));
    const additionalSample = Math.max(0, line.sampleAllowance) || existingSample;
    const cumulativeSample = Number((existingSample + additionalSample).toFixed(2));
    const bagGross = Number(lot.bags ?? 0) * Number(lot.kg_per_bag ?? 0);
    const baseGross = Number(lot.gross_wt ?? 0) || bagGross || Number(lot.net_wt ?? 0) + existingSample;
    const nextNet = Number(Math.max(0, baseGross - cumulativeSample).toFixed(2));
    await supabase
      .from("auction_lots")
      .update({ state: "re-print", sample_allowance: cumulativeSample, net_wt: nextNet })
      .eq("id", lot.id);
    await writeAudit(supabase, profile.factory_id, {
      saleId: lot.sale_id,
      lotId: lot.id,
      action: reprintAuditAction,
      detail: `Invoice ${line.invoiceNo} was not sold and moved to re-print. Sample allowance increased from ${existingSample.toFixed(2)} kg to ${cumulativeSample.toFixed(2)} kg; remaining net weight is ${nextNet.toFixed(2)} kg.`,
      reason: `Sellers contract ${line.contractNo} marked the lot NOT SOLD. It can return through a later sale acknowledgement.`,
      actor: profile.name,
    });
  }

  // Resolve buyers (upsert by name).
  const soldLines = parsed.lines.filter((line) => line.sold !== false);
  const uniqueBuyers = [...new Map(soldLines.map((l) => [l.buyerName, l.buyerVatNo])).entries()]
    .filter(([name]) => name)
    .map(([name, vatNo]) => ({ factory_id: profile.factory_id, name, vat_no: vatNo || null }));
  const buyerByName = new Map<string, string>();
  if (uniqueBuyers.length > 0) {
    const { data: upserted } = await supabase
      .from("buyers")
      .upsert(uniqueBuyers, { onConflict: "factory_id,name" })
      .select("id, name");
    for (const b of upserted ?? []) buyerByName.set(b.name as string, b.id as string);
  }

  // ── Sale lines (one row per lot; last contract line wins, as before) ──
  const matchedLines = soldLines.filter((line) => lotByInv.has(line.invoiceNo));
  const applied = matchedLines.length;
  const saleLineByLot = new Map<string, Record<string, unknown>>();
  for (const line of matchedLines) {
    const lot = lotByInv.get(line.invoiceNo)!;
    saleLineByLot.set(lot.id, {
      factory_id: profile.factory_id, sale_id: lot.sale_id, lot_id: lot.id,
      buyer_id: buyerByName.get(line.buyerName) ?? null,
      gross_wt: line.grossWt, sample_allowance: line.sampleAllowance,
      net_wt: line.netWt, price_per_kg: line.pricePerKg,
      proceeds: line.proceeds, vat_amount: line.vatAmount,
      on_guarantee: line.onGuarantee,
    });
  }
  if (saleLineByLot.size > 0) {
    await supabase.from("sale_lines").upsert([...saleLineByLot.values()], { onConflict: "lot_id" });
    await supabase.from("auction_lots").update({ state: "sold" }).in("id", [...saleLineByLot.keys()]);
  }

  // ── Settlements per contract (A3) ──
  const { data: saleData } = await supabase.from("auction_sales").select("broker_id").eq("id", saleId).single();
  const brokerId = saleData?.broker_id as string | undefined;
  let settlementCount = 0;

  if (brokerId) {
    const { data: ratesRows } = await supabase
      .from("broker_rates")
      .select("*")
      .eq("broker_id", brokerId)
      .order("effective_from", { ascending: false })
      .limit(1);
    const rateCard = ratesRows?.[0];

    // Fetch existing sale lines we just upserted (with their ids) for VAT ledger
    const { data: saleLines } = await supabase
      .from("sale_lines")
      .select("id, lot_id, invoice_no, proceeds, vat_amount, on_guarantee")
      .in("sale_id", groupIds);

    if (rateCard) {
      const rates = {
        insurancePerKg: Number(rateCard.insurance_per_kg),
        publicSaleExPerLot: Number(rateCard.public_sale_ex_per_lot),
        brokeragePct: Number(rateCard.brokerage_pct),
        handlingPerKg: Number(rateCard.handling_per_kg),
        documentationPerLot: Number(rateCard.documentation_per_lot),
        eplatformPerKg: Number(rateCard.eplatform_per_kg),
        govtReliefLoan: Number(rateCard.govt_relief_loan),
        chargesVatPct: Number(rateCard.charges_vat_pct),
        proceedsVatPct: Number(rateCard.proceeds_vat_pct),
      };
      // Compute every contract's settlement first (pure), then write all
      // settlements and all their charge lines in two batched upserts.
      const computed = parsed.contracts.map((c) => {
        const contractLines = soldLines.filter((l) => l.contractNo === c.contractNo);
        const proceedsTotal = contractLines.reduce((s, l) => s + l.proceeds, 0);
        const s = computeSettlement(rates, {
          contractNo: c.contractNo,
          netKg: contractLines.reduce((sum, l) => sum + l.netWt, 0),
          lotCount: contractLines.length,
          proceedsTotal,
        });
        return { contractNo: c.contractNo, proceedsTotal, s };
      });

      const { data: upsertedSettlements } = await supabase
        .from("settlements")
        .upsert(
          computed.map(({ contractNo, proceedsTotal, s }) => ({
            factory_id: profile.factory_id, sale_id: saleId,
            contract_no: contractNo, proceeds_total: proceedsTotal.toFixed(2),
            total_deductions: s.totalDeductions.toFixed(2),
            net_proceeds: s.netProceeds.toFixed(2),
            output_vat: s.outputVat.toFixed(2),
            total_net_proceeds: s.totalNetProceeds.toFixed(2),
            prompt_date: toISODate(parsed.promptDate),
          })),
          { onConflict: "factory_id,contract_no" },
        )
        .select("id, contract_no");
      const settlementIdByContract = new Map<string, string>(
        (upsertedSettlements ?? []).map((r) => [r.contract_no as string, r.id as string]),
      );
      settlementCount = settlementIdByContract.size;

      const chargeRows = computed.flatMap(({ contractNo, s }) => {
        const settlementId = settlementIdByContract.get(contractNo);
        if (!settlementId) return [];
        return s.charges.map((ch) => ({
          factory_id: profile.factory_id, settlement_id: settlementId,
          code: ch.code, label: ch.label, basis: ch.basis,
          rate: ch.rate.toFixed(4), amount: ch.amount.toFixed(2),
          sort_order: String(ch.sortOrder),
        }));
      });
      if (chargeRows.length > 0) {
        await supabase.from("settlement_charges").upsert(chargeRows, { onConflict: "settlement_id,code" });
      }
    }

    // ── VAT ledger (A3) ──
    if (saleLines?.length) {
      const vatInputs = saleLines.map((sl) => ({
        saleLineId: sl.id as string,
        lotId: sl.lot_id as string,
        invoiceNo: (sl as { invoice_no?: string }).invoice_no ?? "",
        proceeds: Number(sl.proceeds),
        vatAmount: Number(sl.vat_amount),
        onGuarantee: Boolean(sl.on_guarantee),
      }));

      const { data: settlementRows } = await supabase
        .from("settlement_charges")
        .select("amount")
        .eq("factory_id", profile.factory_id)
        .eq("code", "charges_vat");
      const inputVat = (settlementRows ?? []).reduce((s, c) => s + Number(c.amount), 0);

      const recon = reconcileVat(vatInputs, inputVat);

      if (recon.lines.length > 0) {
        await supabase.from("vat_ledger").upsert(
          recon.lines.map((l) => ({
            factory_id: profile.factory_id, sale_line_id: l.saleLineId,
            flow: l.flow, vat_amount: l.vatAmount.toFixed(2), mode: l.mode,
            status: "pending",
          })),
          { onConflict: "sale_line_id" },
        );
      }
    }
  }

  // The contract settles the whole broker/sale group: stamp the prompt date on
  // related dispatches, but keep dispatch status capped at catalogued.
  const settledSales = new Set<string>([saleId]);
  for (const line of matchedLines) {
    const lot = lotByInv.get(line.invoiceNo);
    if (lot) settledSales.add(lot.sale_id);
  }
  await supabase
    .from("auction_sales")
    .update({ prompt_date: toISODate(parsed.promptDate) })
    .in("id", [...settledSales]);
  await supabase.from("doc_imports").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", importId);
  revalidatePath(detail);
  revalidatePath(`${AUC}/reprints`);
  const settlementNote = settlementCount
    ? `; ${settlementCount} settlement(s) computed`
    : "";
  redirect(
    `${detail}?notice=${encodeURIComponent(`Recorded ${applied} sale line(s)${settlementNote}; ${notSoldMatches.length} lot(s) moved to re-print; prompt date ${parsed.promptDate ?? "—"}.`)}`,
  );
}

export async function rejectImport(importId: string, saleId: string) {
  const { supabase, profile } = await requireModuleAccess("auction");
  await supabase.from("doc_imports").update({ status: "rejected" }).eq("id", importId);
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  revalidatePath(detail);
  redirect(detail);
}
