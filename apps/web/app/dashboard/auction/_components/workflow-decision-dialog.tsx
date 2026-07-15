"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppButton } from "@/components/ui/button";

export function WorkflowDecisionDialog({
  open,
  title,
  description,
  warning,
  reason,
  reasonPlaceholder,
  confirmLabel,
  busy,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  warning?: ReactNode;
  reason: string;
  reasonPlaceholder: string;
  confirmLabel: string;
  busy: boolean;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return createPortal(
    <>
      <button type="button" aria-label="Cancel workflow decision" disabled={busy} onClick={onCancel} className="fixed inset-0 z-[140] cursor-default bg-stone-950/40 backdrop-blur-[2px]" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="fixed left-1/2 top-1/2 z-[150] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-stone-900"
      >
        <h3 id={`${id}-title`} className="text-base font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
        <div id={`${id}-description`} className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">{description}</div>
        {warning && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">{warning}</div>}
        <label className="mt-4 grid gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400" htmlFor={`${id}-reason`}>
          Reason (optional, kept in the audit trail)
          <textarea
            id={`${id}-reason`}
            autoFocus
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={2}
            placeholder={reasonPlaceholder}
            className="w-full rounded-xl border border-stone-300 bg-white p-2 text-sm font-normal text-stone-700 outline-none focus:border-green-600 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-200"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <AppButton type="button" disabled={busy} onClick={onCancel}>Cancel</AppButton>
          <AppButton type="button" variant="primary" busy={busy} busyLabel="Saving…" onClick={onConfirm}>{confirmLabel}</AppButton>
        </div>
      </section>
    </>,
    document.body,
  );
}
