"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatFourDigitNo } from "../sale-number";
import type { LotRow } from "./lot-row";

type PrintoutProps = {
  factoryName: string;
  factoryLogoUrl: string | null;
  elevation: string | null;
  broker: string;
  sellingMarkCode: string | null;
  sellingMarkName: string | null;
  dispatchDate: string | null;
  transporter: string | null;
  brokerLorryNo: string | null;
  driverName: string | null;
  rows: LotRow[];
};

// The paper form is a ruled grid the factory files in triplicate, so it always
// prints its full body of rows — filled ones first, blank ones after.
const FORM_ROWS = 18;

/**
 * The paper/PDF form of a Dispatch Invoice: the estate's own TEA ESTATE INVOICE
 * sheet. `window.print()` drives it directly, with no separate route or popup
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
  factoryName,
  factoryLogoUrl,
  elevation,
  broker,
  sellingMarkCode,
  sellingMarkName,
  dispatchDate,
  transporter,
  brokerLorryNo,
  driverName,
  rows,
}: PrintoutProps) {
  const totalBags = rows.reduce((sum, row) => sum + Number(row.bags ?? 0), 0);
  const totalEach = rows.reduce((sum, row) => sum + Number(row.kg_per_bag ?? 0), 0);
  const totalSample = rows.reduce((sum, row) => sum + Number(row.sample_allowance ?? 0), 0);
  const totalNetWt = rows.reduce((sum, row) => sum + Number(row.net_wt ?? 0), 0);
  const totalGrossWt = totalNetWt + totalSample;
  const blankRows = Math.max(FORM_ROWS - rows.length, 0);

  return (
    <>
      {/* The estate form is a twelve-column landscape sheet; the payment
          statement elsewhere in the app stays portrait, so the page box is set
          here rather than in the shared print stylesheet. */}
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } }`}</style>
      <div
        data-print-document
        className="hidden text-[9pt] leading-tight text-black"
        style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
      >
        <header className="mb-3 flex items-center gap-4">
          {/* Fixed box, eager: the sheet is laid out only when the print dialog
              opens, and a logo that is still loading then prints as a gap. */}
          <div className="flex h-16 w-24 shrink-0 items-center justify-start">
            {factoryLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={factoryLogoUrl}
                alt=""
                loading="eager"
                decoding="sync"
                className="max-h-16 max-w-24 object-contain"
              />
            )}
          </div>
          <div className="flex-1 text-center">
            <h1 className="text-[18pt] font-bold">{factoryName}</h1>
            <p className="text-[11pt] tracking-wide">TEA ESTATE INVOICE</p>
          </div>
          <div className="h-16 w-24 shrink-0" />
        </header>

        <section className="mb-2 flex justify-between gap-8">
          <dl className="space-y-0.5">
            <FormField label="Factory Reg No" value={sellingMarkCode} />
            <FormField label="Selling Mark" value={sellingMarkName} bold />
            <FormField label="Proprietor" value={factoryName} />
            <FormField label="Broker" value={broker} />
          </dl>
          <dl className="space-y-0.5 pr-8">
            <FormField label="Stores" value={null} labelWidth="w-32" />
            <FormField label="Elevation" value={elevation} labelWidth="w-32" />
            <FormField label="Dispatched Date" value={dispatchDate} labelWidth="w-32" />
          </dl>
        </section>

        <table className="w-full table-fixed border-collapse border border-black text-[8pt]">
          <thead>
            <tr className="bg-[#cfe4ef] text-center align-middle">
              <Th width="w-[7%]">Invoice<br />Number</Th>
              <Th width="w-[8%]">M/F Date</Th>
              <Th width="w-[6%]">F/H/B</Th>
              <Th width="w-[7%]">No of<br />Packages</Th>
              <Th width="w-[8%]">Net Weight<br />Each</Th>
              <Th width="w-[7%]">Sample<br />Allow</Th>
              <Th width="w-[9%]">Total<br />NetWeight</Th>
              <Th width="w-[9%]">Total Gross<br />Weight</Th>
              <Th width="w-[9%]">Grade</Th>
              <Th width="w-[11%]">Type of Chests</Th>
              <Th width="w-[10%]">Chest<br />Numbers</Th>
              <Th width="w-[9%]">Moisture<br />Level</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const invoiceNos = row.lot_invoices?.length
                ? row.lot_invoices.map((invoice) => formatFourDigitNo(invoice.invoice_no)).join(", ")
                : formatFourDigitNo(row.invoice_no);
              const grossWt = Number(row.net_wt ?? 0) + Number(row.sample_allowance ?? 0);
              return (
                <tr key={row.id}>
                  <Td>{invoiceNos}</Td>
                  <Td>{row.mf_date ?? ""}</Td>
                  <Td>{row.bag_type ?? ""}</Td>
                  <Td align="right">{row.bags ?? ""}</Td>
                  <Td align="right">{formatNumber(row.kg_per_bag)}</Td>
                  <Td align="right">{formatNumber(row.sample_allowance)}</Td>
                  <Td align="right">{formatNumber(row.net_wt)}</Td>
                  <Td align="right">{formatNumber(grossWt)}</Td>
                  <Td>{row.grade ?? ""}</Td>
                  <Td>{row.chest_type ?? ""}</Td>
                  <Td>{row.chest_numbers ?? ""}</Td>
                  <Td align="right">{formatNumber(row.moisture_level)}</Td>
                </tr>
              );
            })}
            {Array.from({ length: blankRows }, (_, index) => (
              <tr key={`blank-${index}`}>
                {Array.from({ length: 12 }, (__, cell) => (
                  <Td key={cell} />
                ))}
              </tr>
            ))}
            <tr className="font-semibold">
              <Td>Total</Td>
              <Td />
              <Td />
              <Td align="right">{formatNumber(totalBags)}</Td>
              <Td align="right">{formatNumber(totalEach)}</Td>
              <Td align="right">{formatNumber(totalSample)}</Td>
              <Td align="right">{formatNumber(totalNetWt)}</Td>
              <Td align="right">{formatNumber(totalGrossWt)}</Td>
              <Td />
              <Td />
              <Td />
              <Td />
            </tr>
          </tbody>
        </table>

        <p className="mt-4 text-center text-[8pt]">
          ..................................................
          <br />
          Superintendent&apos;s Signature
        </p>

        <p className="mt-3 text-[8pt] font-semibold underline">
          DISTRIBUTION OF COPIES : White and pink copy : Brokers store with the delivery of Tea. Green copy : Estate File.
        </p>

        <div className="mt-3 flex justify-between gap-6 text-[8pt]">
          <span>
            Transporter :<strong> {transporter || ""}</strong>
          </span>
          <span>
            Lorry No :<strong> {brokerLorryNo || ""}</strong>
          </span>
          <span>Driver : {driverName || ""}</span>
          <span>Reference :</span>
          <span>Factory Officer : ..............................</span>
        </div>
      </div>
    </>
  );
}

function formatNumber(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : "";
}

function FormField({
  label,
  value,
  bold = false,
  labelWidth = "w-28",
}: {
  label: string;
  value: string | null;
  bold?: boolean;
  labelWidth?: string;
}) {
  return (
    <div className="flex gap-1">
      <dt className={labelWidth}>{label}</dt>
      <dd className={bold ? "font-bold" : undefined}>: {value || ""}</dd>
    </div>
  );
}

function Th({ children, width }: { children?: React.ReactNode; width: string }) {
  return <th className={`${width} border border-black px-1 py-1 font-normal`}>{children}</th>;
}

function Td({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <td className={`h-[22px] border border-black px-1 py-0.5 ${align === "right" ? "text-right tabular-nums" : "text-left"}`}>
      {children}
    </td>
  );
}
