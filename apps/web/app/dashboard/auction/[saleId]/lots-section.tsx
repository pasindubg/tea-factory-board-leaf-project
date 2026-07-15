"use client";

import { DispatchedLotsTable } from "./dispatched-lots-table";
import type { LotRow } from "./lot-row";

export function LotsSection({
  rows,
  saleId,
  isOwner,
  grades,
  canEdit,
  canAdd,
  soldLotIds,
  title = "Lot invoices",
  onRowsChange,
}: {
  rows: LotRow[];
  saleId: string;
  isOwner: boolean;
  grades: { code: string; name: string }[];
  canEdit: boolean;
  canAdd: boolean;
  soldLotIds: string[];
  title?: string;
  onRowsChange?: (rows: LotRow[]) => void;
}) {
  return (
    <DispatchedLotsTable
      initialRows={rows}
      saleId={saleId}
      isOwner={isOwner}
      canEdit={canEdit}
      canAdd={canAdd}
      grades={grades}
      soldLotIds={soldLotIds}
      title={title}
      onRowsChange={onRowsChange}
    />
  );
}
