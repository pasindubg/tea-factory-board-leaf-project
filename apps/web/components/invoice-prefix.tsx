"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { invoiceSeqOf } from "@/app/dashboard/auction/invoice-number";

/**
 * Whether composite invoice numbers show their prefix ("26I01-0958") or just
 * the sequence ("0958").
 *
 * Display only — what a user TYPES is untouched, and what is stored is always
 * the composite. Hiding the prefix is a reading preference for a factory that
 * runs one series and finds it noise; it must never change a value.
 *
 * The preference is one app-wide value rather than per list: the same invoice
 * appears in several lists at once, and showing it differently in each is
 * exactly the confusion this is meant to remove. A module-level subscriber set
 * keeps every mounted list in step the moment it is toggled — localStorage's
 * own `storage` event only fires in OTHER tabs, so it cannot do this alone.
 */
const STORAGE_KEY = "invoice-prefix-visible";
const listeners = new Set<(visible: boolean) => void>();
let current = true;

function publish(visible: boolean) {
  current = visible;
  try {
    window.localStorage.setItem(STORAGE_KEY, visible ? "1" : "0");
  } catch {
    // A blocked or full quota must not break the list.
  }
  for (const listener of listeners) listener(visible);
}

export function useInvoicePrefix() {
  // Starts from the shared default so server and first client render agree;
  // the stored value is adopted in the effect below.
  const [visible, setVisible] = useState(current);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) current = stored === "1";
    } catch {
      // Ignore — fall back to the default.
    }
    setVisible(current);
    listeners.add(setVisible);
    return () => { listeners.delete(setVisible); };
  }, []);

  return { visible, setVisible: useCallback((next: boolean) => publish(next), []) };
}

/** The invoice number as it should READ right now. Never what gets submitted. */
export function displayInvoiceNo(value: string | null | undefined, visible: boolean): string {
  const raw = String(value ?? "").trim();
  if (!raw || visible) return raw;
  // Handles the "0951, 0952" multi-invoice form each list renders.
  return raw.split(",").map((part) => invoiceSeqOf(part.trim())).join(", ");
}

/**
 * Right-click menu for an invoice-number cell. Rendered by the framework for
 * any column marked `prefixColumn`, so the commands sit on the data they
 * affect rather than in a settings screen far away from it.
 */
export function InvoicePrefixMenu({
  anchor,
  onClose,
}: {
  anchor: { x: number; y: number } | null;
  onClose: () => void;
}) {
  const popoverId = `invoice-prefix-${useId().replace(/:/g, "")}`;
  const popoverRef = useRef<HTMLDivElement>(null);
  const { visible, setVisible } = useInvoicePrefix();

  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    if (!anchor) { if (popover.matches(":popover-open")) popover.hidePopover(); return; }
    popover.style.left = `${anchor.x}px`;
    popover.style.top = `${anchor.y}px`;
    // Opened on the NEXT task, not synchronously. A macOS two-finger tap
    // dispatches `contextmenu` and then a trailing `click`; a popover="auto"
    // opened in the same turn sees that click as an outside interaction and
    // light-dismisses itself at once, so the menu only ever appeared for
    // ctrl+click (which suppresses the click). Letting the click land first
    // makes both gestures behave the same.
    const timer = window.setTimeout(() => {
      if (!popover.matches(":popover-open")) popover.showPopover();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [anchor]);

  function choose(next: boolean) {
    setVisible(next);
    onClose();
  }

  return (
    <div
      ref={popoverRef}
      id={popoverId}
      popover="auto"
      role="menu"
      onToggle={(event) => {
        if ((event as unknown as { newState?: string }).newState === "closed") onClose();
      }}
      className="fixed z-[140] m-0 w-52 rounded-xl border border-stone-200 bg-white p-1 shadow-2xl dark:border-stone-700 dark:bg-stone-900"
    >
      <MenuItem active={visible} label="Show invoice prefix" onSelect={() => choose(true)} />
      <MenuItem active={!visible} label="Hide invoice prefix" onSelect={() => choose(false)} />
    </div>
  );
}

function MenuItem({ active, label, onSelect }: { active: boolean; label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      // Commit on pointerdown, not click. A popover="auto" light-dismisses on
      // the pointer interaction, which tears the menu down before the click
      // completes — so the item's onClick never ran and the toggle appeared
      // dead. Same reason LovCombobox commits its options on mousedown.
      onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onSelect(); }}
      onClick={(event) => event.preventDefault()}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
        active
          ? "bg-green-50 font-semibold text-green-900 dark:bg-green-950 dark:text-green-100"
          : "text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
      }`}
    >
      <span aria-hidden="true" className="w-4 shrink-0 text-center">{active ? "✓" : ""}</span>
      {label}
    </button>
  );
}
