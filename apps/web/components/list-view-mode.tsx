"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * How a framework list lays its table out.
 *
 * `list`  — fits the viewport: no horizontal scrollbar, only the columns that
 *           fit are shown, and every cell is one truncated line.
 * `table` — the full grid: horizontal scrolling, every column present, and
 *           column widths the user can drag.
 *
 * `list` is the default because a list should be readable without sideways
 * scrolling; `table` is opted into when the whole record matters.
 */
export type ListViewMode = "list" | "table";

export const DEFAULT_LIST_VIEW_MODE: ListViewMode = "list";
/** Fallback minimum a column is allowed to occupy before it stops fitting. */
export const DEFAULT_COLUMN_MIN_WIDTH = 150;

export type ListColumnWidths = Record<string, number>;

type StoredViewState = { mode: ListViewMode; widths: ListColumnWidths };

const STORAGE_PREFIX = "list-view:";

function readStored(scope: string): StoredViewState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${scope}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredViewState>;
    const mode = parsed.mode === "table" ? "table" : "list";
    const widths: ListColumnWidths = {};
    for (const [key, value] of Object.entries(parsed.widths ?? {})) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) widths[key] = value;
    }
    return { mode, widths };
  } catch {
    return null;
  }
}

/**
 * View mode and column widths for one list, remembered per list scope.
 *
 * The stored value is read in an effect rather than in the initial state so
 * the server-rendered markup and the first client render agree — seeding from
 * localStorage during render is a hydration mismatch.
 */
export function useListViewMode(scope: string) {
  const [mode, setModeState] = useState<ListViewMode>(DEFAULT_LIST_VIEW_MODE);
  const [widths, setWidthsState] = useState<ListColumnWidths>({});
  const loaded = useRef(false);

  useEffect(() => {
    const stored = readStored(scope);
    loaded.current = true;
    if (!stored) {
      setModeState(DEFAULT_LIST_VIEW_MODE);
      setWidthsState({});
      return;
    }
    setModeState(stored.mode);
    setWidthsState(stored.widths);
  }, [scope]);

  const persist = useCallback((next: StoredViewState) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${scope}`, JSON.stringify(next));
    } catch {
      // A full or blocked storage quota must never break the list itself.
    }
  }, [scope]);

  const setMode = useCallback((next: ListViewMode) => {
    setModeState(next);
    setWidthsState((current) => {
      persist({ mode: next, widths: current });
      return current;
    });
  }, [persist]);

  const setColumnWidth = useCallback((key: string, width: number) => {
    setWidthsState((current) => {
      const next = { ...current, [key]: Math.round(width) };
      persist({ mode, widths: next });
      return next;
    });
  }, [mode, persist]);

  return { mode, setMode, widths, setColumnWidth };
}

/**
 * The list's display-mode control. Deliberately a small icon button rather
 * than two visible toggles: it is a per-user display preference, not a command
 * on the records, so it should not compete with the list's real actions.
 */
export function ListViewModeMenu({ mode, onChange }: { mode: ListViewMode; onChange: (mode: ListViewMode) => void }) {
  const popoverId = `list-view-${useId().replace(/:/g, "")}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function position() {
    const trigger = buttonRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    const rect = trigger.getBoundingClientRect();
    // Right-aligned under the trigger, and never off the left edge.
    popover.style.left = `${Math.max(8, rect.right - popover.offsetWidth)}px`;
    popover.style.top = `${rect.bottom + 6}px`;
  }

  function choose(next: ListViewMode) {
    onChange(next);
    popoverRef.current?.hidePopover();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        popoverTarget={popoverId}
        popoverTargetAction="toggle"
        onClick={() => requestAnimationFrame(position)}
        title="Display settings"
        aria-label="Display settings"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
      >
        <GearGlyph />
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        role="menu"
        aria-label="List display mode"
        className="fixed z-[130] m-0 w-52 rounded-xl border border-stone-200 bg-white p-1 shadow-2xl dark:border-stone-700 dark:bg-stone-900"
      >
        <ModeOption
          active={mode === "list"}
          label="List"
          hint="Fits the screen"
          icon={<ListGlyph />}
          onSelect={() => choose("list")}
        />
        <ModeOption
          active={mode === "table"}
          label="Table"
          hint="All columns, resizable"
          icon={<TableGlyph />}
          onSelect={() => choose("table")}
        />
      </div>
    </>
  );
}

function ModeOption({
  active,
  label,
  hint,
  icon,
  onSelect,
}: {
  active: boolean;
  label: string;
  hint: string;
  icon: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
        active
          ? "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100"
          : "text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
      }`}
    >
      <span aria-hidden="true" className="shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-stone-500 dark:text-stone-400">{hint}</span>
      </span>
      {active && <CheckGlyph />}
    </button>
  );
}

function GearGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path fillRule="evenodd" d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.968.34 1.409.582l1.25-.834a1 1 0 0 1 1.262.125l.962.962a1 1 0 0 1 .125 1.262l-.834 1.25c.242.44.438.912.582 1.409l1.473.294a1 1 0 0 1 .804.98v1.361a1 1 0 0 1-.804.98l-1.473.295a6.95 6.95 0 0 1-.582 1.409l.834 1.25a1 1 0 0 1-.125 1.262l-.962.962a1 1 0 0 1-1.262.125l-1.25-.834c-.44.242-.912.438-1.409.582l-.294 1.473a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.295-1.473a6.95 6.95 0 0 1-1.409-.582l-1.25.834a1 1 0 0 1-1.262-.125l-.962-.962a1 1 0 0 1-.125-1.262l.834-1.25a6.95 6.95 0 0 1-.582-1.409l-1.473-.294A1 1 0 0 1 1 10.68V9.32a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.34-.968.582-1.409l-.834-1.25a1 1 0 0 1 .125-1.262l.962-.962A1 1 0 0 1 5.374 3.04l1.25.834c.44-.242.912-.438 1.409-.582l.294-1.473ZM13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clipRule="evenodd" />
    </svg>
  );
}

function ListGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path fillRule="evenodd" d="M3 4.75A.75.75 0 0 1 3.75 4h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 4.75Zm0 3.5A.75.75 0 0 1 3.75 7.5h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 8.25Zm0 3.5a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Zm0 3.5a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
    </svg>
  );
}

function TableGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="1.5" />
      <path d="M2.75 8h14.5M8 3.75v12.5M13 3.75v12.5" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="ml-auto h-4 w-4 shrink-0">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
    </svg>
  );
}
