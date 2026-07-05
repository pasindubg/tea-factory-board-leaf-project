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
import { AUC, back, extractPdf, stageImport, toISODate, saleGroupIds } from "./_shared";
import { buildInvoicedLots } from "../recon-helpers";
import { formatFourDigitNo } from "../sale-number";

// ---------- Acknowledgement (① catalogue & reconcile) ----------
export async function ingestAcknowledgement(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${saleId}`;
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (text === null) return back(detail, "Choose a valid Acknowledgement PDF to upload.");
  if (!isAcknowledgement(text)) return back(detail, "That doesn't look like an Acknowledgement document.");
  const parsed = parseAcknowledgement(text);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "acknowledgement", file as File, parsed);
  if (!importId) return back(detail, "Could not stage the document.");
  redirect(`${detail}/ack/${importId}`);
}

export async function confirmAcknowledgement(importId: string, saleId: string) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${saleId}`;
  const { data: imp } = await supabase
    .from("doc_imports")
    .select("id, parsed_json")
    .eq("id", importId)
    .single();
  if (!imp?.parsed_json) return back(detail, "Staged import not found.");
  const rawParsed = imp.parsed_json as ParsedAcknowledgement;
  const parsed: ParsedAcknowledgement = {
    ...rawParsed,
    lots: rawParsed.lots.map((lot) => ({
      ...lot,
      invoiceNo: formatFourDigitNo(lot.invoiceNo),
      lotNo: formatFourDigitNo(lot.lotNo) || null,
    })),
  };

  // The ack covers the whole sale for this broker — the factory may have split
  // that sale across several dispatches, so reconcile against ALL of them.
  const groupIds = await saleGroupIds(supabase, profile.factory_id, saleId);
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

  const unexpectedAckRows = recon.rows
    .filter((row) => row.status === "unexpected" && row.ack)
    .map((row) => {
      const ackLot = parsed.lots.find((lot) => lot.invoiceNo === row.invoiceNo && lot.lotNo === row.ack?.lotNo);
      if (!ackLot) return null;
      return {
        factory_id: profile.factory_id,
        sale_id: saleId,
        mark_id: markByCode.get(ackLot.markCode.toUpperCase()) ?? null,
        invoice_no: formatFourDigitNo(ackLot.invoiceNo),
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

  let createdAcknowledgedLots = 0;
  if (unexpectedAckRows.length > 0) {
    const { data: createdLots } = await supabase
      .from("auction_lots")
      .insert(unexpectedAckRows)
      .select("id, invoice_no");
    createdAcknowledgedLots = unexpectedAckRows.filter((row) => row.state === "acknowledged").length;
    if (createdLots && createdLots.length > 0) {
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
  if (createdAcknowledgedLots > 0) affectedSales.add(saleId);
  if (affectedSales.size > 0) {
    await supabase
      .from("auction_sales")
      .update({ status: "catalogued" })
      .in("id", [...affectedSales])
      .in("status", ["draft", "dispatched", "grn"]);
  }
  revalidatePath(detail);
  redirect(
    `${detail}?notice=${encodeURIComponent(`Acknowledged ${recon.summary.catalogued} lot(s); ${recon.summary.shutout} shutout.`)}`,
  );
}

export async function rejectAcknowledgement(importId: string, saleId: string) {
  const { supabase } = await requireModuleAccess("auction");
  await supabase.from("doc_imports").update({ status: "rejected" }).eq("id", importId);
  revalidatePath(`${AUC}/${saleId}`);
  redirect(`${AUC}/${saleId}`);
}

// ---------- Valuation (② valuation ↔ realised) ----------
export async function ingestValuation(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${saleId}`;
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (text === null) return back(detail, "Choose a valid Valuation PDF to upload.");
  if (!isValuation(text)) return back(detail, "That doesn't look like a Valuation Report.");
  const parsed = parseValuation(text);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "valuation", file as File, parsed);
  if (!importId) return back(detail, "Could not stage the document.");
  redirect(`${detail}/valuation/${importId}`);
}

export async function confirmValuation(importId: string, saleId: string) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${saleId}`;
  const { data: imp } = await supabase.from("doc_imports").select("parsed_json").eq("id", importId).single();
  if (!imp?.parsed_json) return back(detail, "Staged import not found.");
  const rawParsed = imp.parsed_json as ParsedValuation;
  const parsed: ParsedValuation = {
    ...rawParsed,
    lots: rawParsed.lots.map((lot) => ({
      ...lot,
      invoiceNo: formatFourDigitNo(lot.invoiceNo),
      lotNo: formatFourDigitNo(lot.lotNo),
    })),
  };

  // The valuation covers the broker's whole sale — match lots across all
  // dispatches in the sale group, not just the one it was uploaded to.
  const groupIds = await saleGroupIds(supabase, profile.factory_id, saleId);
  const { data: lotRows } = await supabase.from("auction_lots").select("id, sale_id, invoice_no").in("sale_id", groupIds);
  const lotByInv = new Map<string, string>((lotRows ?? []).map((l) => [formatFourDigitNo(l.invoice_no as string), l.id as string]));
  const saleIdByLot = new Map((lotRows ?? []).map((l) => [l.id as string, l.sale_id as string]));

  // One valuation per lot (last line wins, as the sequential upsert did); flip
  // matched lots to "valued" in a single statement.
  const valued = parsed.lots.filter((v) => lotByInv.has(v.invoiceNo));
  const applied = valued.length;
  const valuationByLot = new Map<string, Record<string, unknown>>();
  for (const v of valued) {
    const lotId = lotByInv.get(v.invoiceNo)!;
    valuationByLot.set(lotId, {
      factory_id: profile.factory_id, lot_id: lotId,
      price_min: v.priceMin, price_max: v.priceMax,
      projected_proceeds: v.projectedProceeds, tasting_note: v.tastingNote,
    });
  }
  if (valuationByLot.size > 0) {
    await supabase.from("valuations").upsert([...valuationByLot.values()], { onConflict: "lot_id" });
    await supabase.from("auction_lots").update({ state: "valued" }).in("id", [...valuationByLot.keys()]).neq("state", "shutout");
  }
  await supabase.from("doc_imports").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", importId);
  // Advance every dispatch in the group that had lots valued (never regress a later status).
  const valuedSales = new Set<string>([...valuationByLot.keys()].map((id) => saleIdByLot.get(id) ?? saleId));
  if (valuedSales.size > 0) {
    await supabase
      .from("auction_sales")
      .update({ status: "valued" })
      .in("id", [...valuedSales])
      .in("status", ["draft", "dispatched", "grn", "catalogued"]);
  }
  revalidatePath(detail);
  redirect(`${detail}?notice=${encodeURIComponent(`Recorded valuations for ${applied} lot(s).`)}`);
}

// ---------- Sellers Contract (sale lines, settlements, VAT — A3) ----------
export async function ingestContract(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${saleId}`;
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (text === null) return back(detail, "Choose a valid Sellers Contract PDF to upload.");
  if (!isContract(text)) return back(detail, "That doesn't look like a Sellers Contract & Account Sales document.");
  const parsed = parseContract(text);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "contract", file as File, parsed);
  if (!importId) return back(detail, "Could not stage the document.");
  redirect(`${detail}/contract/${importId}`);
}

export async function confirmContract(importId: string, saleId: string) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${saleId}`;
  const { data: imp } = await supabase.from("doc_imports").select("parsed_json").eq("id", importId).single();
  if (!imp?.parsed_json) return back(detail, "Staged import not found.");
  const rawParsed = imp.parsed_json as ParsedContract;
  const parsed: ParsedContract = {
    ...rawParsed,
    lines: rawParsed.lines.map((line) => ({
      ...line,
      lotNo: formatFourDigitNo(line.lotNo),
      invoiceNo: formatFourDigitNo(line.invoiceNo),
    })),
  };

  // The sellers contract covers the broker's whole sale — match lots across all
  // dispatches in the sale group, and file each sale line under its lot's own dispatch.
  const groupIds = await saleGroupIds(supabase, profile.factory_id, saleId);
  const { data: lotRows } = await supabase.from("auction_lots").select("id, sale_id, invoice_no, net_wt").in("sale_id", groupIds);
  const lotByInv = new Map<string, { id: string; saleId: string; netWt: number }>(
    (lotRows ?? []).map((l) => [
      formatFourDigitNo(l.invoice_no as string),
      { id: l.id as string, saleId: l.sale_id as string, netWt: Number(l.net_wt) },
    ]),
  );

  // Resolve buyers (upsert by name).
  const uniqueBuyers = [...new Map(parsed.lines.map((l) => [l.buyerName, l.buyerVatNo])).entries()]
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
  const matchedLines = parsed.lines.filter((line) => lotByInv.has(line.invoiceNo));
  const applied = matchedLines.length;
  const saleLineByLot = new Map<string, Record<string, unknown>>();
  for (const line of matchedLines) {
    const lot = lotByInv.get(line.invoiceNo)!;
    saleLineByLot.set(lot.id, {
      factory_id: profile.factory_id, sale_id: lot.saleId, lot_id: lot.id,
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
        const contractLines = parsed.lines.filter((l) => l.contractNo === c.contractNo);
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

  // The contract settles the whole broker/sale group: stamp the prompt date and
  // advance status on every dispatch that had lots sold by this contract (plus
  // the one it was uploaded to).
  const settledSales = new Set<string>([saleId]);
  for (const line of matchedLines) {
    const lot = lotByInv.get(line.invoiceNo);
    if (lot) settledSales.add(lot.saleId);
  }
  await supabase
    .from("auction_sales")
    .update({ status: "settled", prompt_date: toISODate(parsed.promptDate) })
    .in("id", [...settledSales]);
  await supabase.from("doc_imports").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", importId);
  revalidatePath(detail);
  const settlementNote = settlementCount
    ? `; ${settlementCount} settlement(s) computed`
    : "";
  redirect(
    `${detail}?notice=${encodeURIComponent(`Recorded ${applied} sale line(s)${settlementNote}; prompt date ${parsed.promptDate ?? "—"}.`)}`,
  );
}

export async function rejectImport(importId: string, saleId: string) {
  const { supabase } = await requireModuleAccess("auction");
  await supabase.from("doc_imports").update({ status: "rejected" }).eq("id", importId);
  revalidatePath(`${AUC}/${saleId}`);
  redirect(`${AUC}/${saleId}`);
}
