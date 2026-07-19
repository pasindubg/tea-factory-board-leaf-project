"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { AppButton } from "@/components/ui/button";

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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
      <button type="button" aria-label="Cancel confirmation" disabled={busy} onClick={onCancel} className="fixed inset-0 z-[140] cursor-default bg-stone-950/35 backdrop-blur-[2px]" />
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" className="fixed left-1/2 top-1/2 z-[150] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-stone-900">
        <h2 id="confirmation-title" className="text-lg font-semibold text-stone-900 dark:text-stone-100">{title}</h2>
        <p id="confirmation-description" className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <AppButton type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancel</AppButton>
          <AppButton type="button" variant={destructive ? "danger" : "primary"} busy={busy} busyLabel="Working…" onClick={onConfirm}>{confirmLabel}</AppButton>
        </div>
      </section>
    </>,
    document.body,
  );
}

/** Drop-in confirmation for a submit button inside a server-action form. */
export function ConfirmSubmitButton({
  title,
  description,
  confirmLabel = "Delete",
  destructive = true,
  children,
  ...buttonProps
}: Omit<ComponentProps<"button">, "type" | "onClick"> & { title: string; description: string; confirmLabel?: string; destructive?: boolean }) {
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        {...buttonProps}
        type="button"
        onClick={(event) => {
          setForm(event.currentTarget.form);
          setOpen(true);
        }}
      >
        {children}
      </button>
      <ConfirmationDialog
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        destructive={destructive}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          form?.requestSubmit();
        }}
      />
    </>
  );
}
