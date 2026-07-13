"use client";

import { useEffect, useState, useTransition } from "react";
import { DispatchLotForm } from "./dispatch-lot-form";
import { DispatchedLotsTable } from "./dispatched-lots-table";
import type { LotRow } from "./lot-row";
import { formatFourDigitNo } from "../sale-number";

export function LotsSection({
  rows,
  saleId,
  isOwner,
  marks,
  grades,
  addAction,
  canEdit,
  canAdd,
  soldLotIds,
  title = "Lot invoices",
}: {
  rows: LotRow[];
  saleId: string;
  isOwner: boolean;
  marks: { id: string; code: string; name: string }[];
  grades: { code: string; name: string }[];
  addAction: (formData: FormData) => Promise<string | null>;
  canEdit: boolean;
  canAdd: boolean;
  soldLotIds: string[];
  title?: string;
}) {
  const [, startTransition] = useTransition();
  const [currentRows, setCurrentRows] = useState(rows);

  useEffect(() => {
    setCurrentRows(rows);
  }, [rows]);

  const totalNet = currentRows.reduce((sum, l) => sum + Number(l.net_wt ?? 0), 0);

  function handleAdd(formData: FormData) {
    const bags = Number(formData.get("bags") ?? 0);
    const kpb = Number(formData.get("kg_per_bag") ?? 0);
    const sampleKg = Math.max(0, Number(formData.get("sample_allowance") ?? 0) || 0);
    const markId = formData.get("mark_id") as string;
    const mark = marks.find((m) => m.id === markId) ?? null;
    const tempId = `pending-${Date.now()}`;

    const optimisticRow: LotRow = {
      id: tempId,
      invoice_no: formatFourDigitNo(formData.get("invoice_no") as string | null) || null,
      provisional_sale_no: null,
      final_sale_no: null,
      lot_no: formatFourDigitNo(formData.get("lot_no") as string | null) || null,
      grade: formData.get("grade") as string | null,
      bags,
      kg_per_bag: kpb,
      sample_allowance: sampleKg,
      net_wt: Math.max(0, bags * kpb - sampleKg),
      state: "invoiced",
      shutout_reason: null,
      lot_source: "factory",
      reprint_target_sale_id: null,
      reprint_target_label: null,
      threshold_min_net_kg: null,
      threshold_applies: false,
      marks: mark ? { code: mark.code, name: mark.name } : null,
      lot_invoices: null,
    };

    startTransition(async () => {
      setCurrentRows((curr) => [...curr, optimisticRow]);
      try {
        const createdId = await addAction(formData);
        if (createdId) {
          setCurrentRows((curr) => curr.map((row) => (row.id === tempId ? { ...row, id: createdId } : row)));
        }
      } catch {
        setCurrentRows((curr) => curr.filter((row) => row.id !== tempId));
      }
    });
  }

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-lg font-medium text-stone-700 dark:text-stone-300">{title}</h3>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {currentRows.length} lot{currentRows.length === 1 ? "" : "s"} · {totalNet.toFixed(2)} kg net
          </p>
        </div>
        {canAdd && <DispatchLotForm action={handleAdd} marks={marks} grades={grades} />}
      </div>

      <div className="mt-4">
        <DispatchedLotsTable
          rows={currentRows}
          setRows={setCurrentRows}
          saleId={saleId}
          isOwner={isOwner}
          canEdit={canEdit}
          soldLotIds={soldLotIds}
        />
      </div>
    </section>
  );
}
