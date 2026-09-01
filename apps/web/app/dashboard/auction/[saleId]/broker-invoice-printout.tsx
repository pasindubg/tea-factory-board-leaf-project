"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";
import { stateBucket } from "../state-buckets";
import type { LotRow } from "./lot-row";

type PrintoutProps = {
  saleNo: string | null;
  broker: string;
  sellingMark: string | null;
  dispatchDate: string | null;
  saleDate: string | null;
  promptDate: string | null;
  targetSaleNo: string | null;
  transporter: string | null;
  brokerLorryNo: string | null;
  driverName: string | null;
  bundleDispatchNo: string | null;
  status: string | null;
  rows: LotRow[];
};

/**
 * The paper/PDF form of a Dispatch Invoice: its attributes plus the full lot
 * list. `window.print()` drives it directly, with no separate route or popup
 * window — a popup opened after the confirm round-trip has lost its user
 * gesture and browsers block it.
 *
 * It is portalled to <body> rather than left in the workspace tree so the
 * print stylesheet can `display: none` the app outright. Hiding the app with
 * `visibility: hidden` instead would keep every element's layout box alive and
 * emit a second, blank sheet for a one-page invoice.
 */
export function BrokerInvoicePrintout(props: PrintoutProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<PrintoutDocument {...props} />, document.body);
}

function PrintoutDocument({
  saleNo,
  broker,
  sellingMark,
  dispatchDate,
  saleDate,
  promptDate,
  targetSaleNo,
  transporter,
  brokerLorryNo,
  driverName,
  bundleDispatchNo,
  status,
  rows,
}: PrintoutProps) {
  const totalBags = rows.reduce((sum, row) => sum + Number(row.bags ?? 0), 0);
  const totalNetWt = rows.reduce((sum, row) => sum + Number(row.net_wt ?? 0), 0);
  const totalSample = rows.reduce((sum, row) => sum + Number(row.sample_allowance ?? 0), 0);

  return (
    <div data-print-document className="hidden text-[11pt] leading-snug">
      <header className="mb-4 border-b-2 border-black pb-2">
        <h1 className="text-[16pt] font-bold">Dispatch Invoice {saleNo ?? "—"}</h1>
        <p className="mt-1 text-[10pt]">
          {broker}
          {sellingMark ? ` · ${sellingMark}` : ""}
          {status ? ` · ${stateBucket(status).label}` : ""}
        </p>
      </header>

      <section className="mb-4">
        <dl className="grid grid-cols-3 gap-x-6 gap-y-2 text-[10pt]">
          <PrintField label="Broker" value={broker} />
          <PrintField label="Selling mark" value={sellingMark} />
          <PrintField label="Sale" value={formatSaleNo(targetSaleNo) || null} />
          <PrintField label="Dispatch date" value={dispatchDate} />
          <PrintField label="Sale date" value={saleDate} />
          <PrintField label="Prompt date" value={promptDate} />
          <PrintField label="Transporter" value={transporter} />
          <PrintField label="Broker lorry no." value={brokerLorryNo} />
          <PrintField label="Driver" value={driverName} />
          <PrintField label="Physical dispatch" value={bundleDispatchNo} />
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-[12pt] font-semibold">Lots ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="text-[10pt] italic">No lots on this dispatch invoice.</p>
        ) : (
          <table className="w-full border-collapse text-[9.5pt]">
            <thead>
              <tr className="border-y border-black">
                <Th>Invoice no.</Th>
                <Th>Lot no.</Th>
                <Th>Mark</Th>
                <Th>Grade</Th>
                <Th align="right">Bags</Th>
                <Th align="right">Kg/bag</Th>
                <Th align="right">Sample kg</Th>
                <Th align="right">Net kg</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const invoiceNos = row.lot_invoices?.length
                  ? row.lot_invoices.map((invoice) => formatFourDigitNo(invoice.invoice_no)).join(", ")
                  : formatFourDigitNo(row.invoice_no);
                return (
                  <tr key={row.id} className="border-b border-stone-400">
                    <Td>{invoiceNos || "—"}</Td>
                    <Td>{formatFourDigitNo(row.lot_no) || "—"}</Td>
                    <Td>{row.marks?.code ?? "—"}</Td>
                    <Td>{row.grade ?? "—"}</Td>
                    <Td align="right">{row.bags ?? "—"}</Td>
                    <Td align="right">{row.kg_per_bag ?? "—"}</Td>
                    <Td align="right">{formatNumber(row.sample_allowance)}</Td>
                    <Td align="right">{formatNumber(row.net_wt)}</Td>
                    <Td>{stateBucket(row.state).label}</Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black font-semibold">
                <Td>Total</Td>
                <Td />
                <Td />
                <Td />
                <Td align="right">{totalBags}</Td>
                <Td align="right" />
                <Td align="right">{formatNumber(totalSample)}</Td>
                <Td align="right">{formatNumber(totalNetWt)}</Td>
                <Td />
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  );
}

function formatNumber(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";
}

function PrintField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[8pt] uppercase tracking-wide text-stone-600">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return <th className={`py-1 pr-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return <td className={`py-1 pr-2 ${align === "right" ? "text-right tabular-nums" : "text-left"}`}>{children}</td>;
}
