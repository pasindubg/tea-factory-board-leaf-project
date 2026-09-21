"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { listViewStorageKey, parseListViewPreferences, resolveListFields, type ListViewPreferences } from "@/lib/list-view-preferences";
import { showAppToast } from "@/components/action-feedback";
import { AppDrawer } from "@/components/ui/drawer";
import { AppButton } from "@/components/ui/button";

/**
 * How a framework list lays its table out.
 *
 * `list`  — fits the viewport: no horizontal scrollbar, only the columns that
 *           fit are shown, and every cell is one truncated line.
 * `table` — the chosen fields: horizontal scrolling and
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

const PreferenceOwner = createContext<{ userId: string; factoryId: string } | null>(null);
export function ListPreferencesProvider({ userId, factoryId, children }: { userId: string; factoryId: string; children: ReactNode }) {
  return <PreferenceOwner.Provider value={{ userId, factoryId }}>{children}</PreferenceOwner.Provider>;
}

function readStored(key: string | null): ListViewPreferences {
  try {
    return parseListViewPreferences(key ? window.localStorage.getItem(key) : null);
  } catch {
    return parseListViewPreferences(null);
  }
}

/**
 * Layout for one list, remembered per authenticated account and list scope.
 *
 * The stored value is read in an effect rather than in the initial state so
 * the server-rendered markup and the first client render agree — seeding from
 * localStorage during render is a hydration mismatch.
 */
export function useListViewMode(scope: string) {
  const owner = useContext(PreferenceOwner);
  const key = owner ? listViewStorageKey(owner.userId, owner.factoryId, scope) : null;
  const [snapshot, setSnapshot] = useState(() => ({ key, value: parseListViewPreferences(null) }));
  const value = snapshot.key === key ? snapshot.value : parseListViewPreferences(null);
  const current = useRef(value);
  current.current = value;

  useEffect(() => {
    const reload = () => {
      current.current = readStored(key);
      setSnapshot({ key, value: current.current });
    };
    const sync = (event: Event) => {
      if (event instanceof StorageEvent ? event.key === key || event.key === null : (event as CustomEvent).detail === key) reload();
    };
    reload();
    window.addEventListener("storage", sync);
    window.addEventListener("list-view-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("list-view-updated", sync);
    };
  }, [key]);

  function update(patch: Partial<ListViewPreferences>) {
    const next = { ...current.current, ...patch };
    current.current = next;
    setSnapshot({ key, value: next });
    try {
      if (!key) throw new Error("No preference owner");
      window.localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("list-view-updated", { detail: key }));
      return true;
    } catch {
      showAppToast("This layout is applied, but browser storage is unavailable. It cannot be remembered.", "error");
      return false;
    }
  }
  return { ...value,
    setMode: (mode: ListViewMode) => update({ mode }),
    setColumnWidth: (column: string, width: number) => update({ widths: { ...current.current.widths, [column]: Math.round(width) } }),
    setFields: (fields: Pick<ListViewPreferences, "order" | "hidden">) => update(fields),
  };
}

/**
 * The list's display-mode control. Deliberately a small icon button rather
 * than two visible toggles: it is a per-user display preference, not a command
 * on the records, so it should not compete with the list's real actions.
 */
export function ListViewModeMenu({ mode, onChange, fields, order, hidden, onFieldsChange, disabled }: {
  mode: ListViewMode; onChange: (mode: ListViewMode) => void;
  fields: { key: string; label: ReactNode }[]; order: string[]; hidden: string[];
  onFieldsChange: (fields: Pick<ListViewPreferences, "order" | "hidden">) => boolean;
  disabled?: boolean;
}) {
  const [arranging, setArranging] = useState(false);
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
        disabled={disabled}
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
          hint="Visible fields, resizable"
          icon={<TableGlyph />}
          onSelect={() => choose("table")}
        />
        <div role="separator" className="-mx-1 my-1 border-t border-stone-200 dark:border-stone-700" />
        <button type="button" role="menuitem"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-stone-700 transition hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
          onClick={() => { popoverRef.current?.hidePopover(); setArranging(true); }}>
          <span aria-hidden="true" className="shrink-0"><ColumnsGlyph /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Configure</span>
            <span className="block text-xs text-stone-500 dark:text-stone-400">Reorder or hide columns</span>
          </span>
          <ChevronGlyph />
        </button>
      </div>
      {arranging && <FieldSettings fields={fields} order={order} hidden={hidden} onClose={() => { setArranging(false); buttonRef.current?.focus(); }} onSave={onFieldsChange} />}
    </>
  );
}

function FieldSettings({ fields, order, hidden, onClose, onSave }: {
  fields: { key: string; label: ReactNode }[]; order: string[]; hidden: string[]; onClose: () => void;
  onSave: (fields: Pick<ListViewPreferences, "order" | "hidden">) => boolean;
}) {
  const [draft, setDraft] = useState({ order, hidden });
  const { ordered, visible } = resolveListFields(fields, draft);
  const firstControl = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstControl.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = firstControl.current?.closest('[role="dialog"]');
      const controls = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, []);
  function move(index: number, offset: number) {
    const order = ordered.map((field) => field.key);
    [order[index], order[index + offset]] = [order[index + offset], order[index]];
    setDraft({ ...draft, order });
  }
  return <AppDrawer open title="Arrange / hide fields" description="Saved for your account and this list in this browser. List mode shows as many visible fields as fit." onClose={onClose}>
    <AppButton ref={firstControl} type="button" onClick={() => setDraft({ order: [], hidden: [] })}>Reset to default</AppButton>
    <p className="my-3 text-sm text-stone-500">Keep at least one field visible. All fields are shown while adding or editing.</p>
    <ol className="space-y-2">
      {ordered.map((field, index) => {
        const shown = visible.some((column) => column.key === field.key);
        const label = typeof field.label === "string" ? field.label : field.key;
        return <li key={field.key} className="flex items-center gap-3 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
          <label className="flex min-w-0 flex-1 items-center gap-3">
            <input type="checkbox" checked={shown} disabled={shown && visible.length === 1} onChange={(event) => setDraft({ ...draft, hidden: event.target.checked ? draft.hidden.filter((key) => key !== field.key) : [...draft.hidden, field.key] })} />
            <span className="truncate">{field.label}</span>
          </label>
          <AppButton type="button" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</AppButton>
          <AppButton type="button" aria-label={`Move ${label} down`} disabled={index === ordered.length - 1} onClick={() => move(index, 1)}>↓</AppButton>
        </li>;
      })}
    </ol>
    <div className="mt-4 flex gap-2">
      <AppButton type="button" onClick={() => { if (onSave(draft)) showAppToast("List fields saved.", "success"); onClose(); }}>Save</AppButton>
      <AppButton type="button" onClick={onClose}>Cancel</AppButton>
    </div>
  </AppDrawer>;
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

function ColumnsGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-5 w-5">
      <path d="M4 3.5v13M10 3.5v13M16 3.5v13" />
      <circle cx="4" cy="7" r="1.75" fill="currentColor" />
      <circle cx="10" cy="12.5" r="1.75" fill="currentColor" />
      <circle cx="16" cy="9" r="1.75" fill="currentColor" />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="ml-auto h-4 w-4 shrink-0 text-stone-400">
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
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
