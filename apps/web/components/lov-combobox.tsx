"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { fetchLovOptions } from "@/lib/list-lov-action";
import type { LovOption, LovSourceKey } from "@/lib/list-lov";

/**
 * The framework's list-of-values picker: a typeahead that queries an
 * allowlisted server source (see list-lov-registry.ts) instead of choosing
 * from a fixed <select>, so a list stays usable once a factory has hundreds of
 * brokers, marks or grades. Options render a label plus an optional secondary
 * description line.
 *
 * Validation is deliberately NOT done here. Typing something that does not
 * exist is not an error while you type — only on save. The typed text is
 * submitted as-is and the FOREIGN KEY on the field rejects it, so the message
 * comes from the database that actually owns the rule and the write is blocked
 * rather than half-applied. `friendlyError` turns that into a message naming
 * the value, and the list surfaces it like any other failed mutation.
 *
 * Form integration matches the rest of the framework, whose create/edit fields
 * live OUTSIDE their <form> and associate through `form={formId}`:
 *   - a hidden input carries the submitted value under `name`;
 *   - the visible text input carries `required`, so an EMPTY required field is
 *     still caught natively (a hidden required input is unfocusable, which
 *     makes native validation fail silently instead of reporting).
 *
 * The dropdown is a native popover rather than an absolutely positioned div:
 * lists render inside horizontally scrolling containers (`list-scroll-x`),
 * which would otherwise clip it. This matches the Search panel's idiom.
 */
export function LovCombobox({
  source,
  options: staticOptions,
  name,
  formId,
  defaultValue = "",
  defaultLabel = "",
  placeholder,
  required = false,
  disabled = false,
  ariaLabel,
  className = "",
  onSelect,
}: {
  /** Server-backed source. Omit when passing `options` instead. */
  source?: LovSourceKey;
  /**
   * A fixed option set, for values that live in the code rather than a table —
   * a status enum, say. Supplying it turns off every server round trip: the
   * whole set is already known, so it is shown in full on open and filtered in
   * the browser as the user types. Exactly one of `source`/`options` is used;
   * `options` wins if both are given.
   */
  options?: LovOption[];
  /** Field name submitted with the form. Omit for search//filter use. */
  name?: string;
  /** Associates both inputs with a framework form rendered elsewhere. */
  formId?: string;
  defaultValue?: string;
  defaultLabel?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Fires on pick and on clear (value ""), for dependent-field side effects. */
  onSelect?: (option: LovOption | null) => void;
}) {
  const rawId = useId().replace(/:/g, "");
  const popoverId = `lov-${rawId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Guards against a slow earlier request overwriting a newer one's options.
  const requestGeneration = useRef(0);

  const [text, setText] = useState(defaultLabel);
  const [value, setValue] = useState(defaultValue);
  const [options, setOptions] = useState<LovOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Mirrors what is currently on screen so the scroll handler can request the
  // next page without re-subscribing every time the options change.
  const loadedRef = useRef({ count: 0, hasMore: false, loading: false, query: "" });
  loadedRef.current = { count: options.length, hasMore, loading: loading || loadingMore, query: text.trim() };

  const position = useCallback(() => {
    const input = inputRef.current;
    const popover = popoverRef.current;
    if (!input || !popover) return;
    const rect = input.getBoundingClientRect();
    popover.style.left = `${rect.left}px`;
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.minWidth = `${Math.max(rect.width, 240)}px`;
  }, []);

  // Open/closed is also tracked in a ref because it changes synchronously:
  // clicking the arrow both focuses the input (whose onFocus opens the list)
  // and calls openList itself, and React state would still read `false` in
  // both, firing two queries and a double showPopover().
  const openRef = useRef(false);

  const closeList = useCallback(() => {
    if (openRef.current) {
      openRef.current = false;
      popoverRef.current?.hidePopover();
    }
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  /** `offset > 0` appends the next page; 0 replaces the list for a new query. */
  const runQuery = useCallback(async (query: string, offset = 0) => {
    // A fixed option set needs no request and no paging: match the typed text
    // as a PREFIX, the same rule the server applies, so both kinds of picker
    // behave identically.
    if (staticOptions) {
      const needle = query.trim().toLowerCase();
      const matches = needle
        ? staticOptions.filter((option) =>
          option.label.toLowerCase().startsWith(needle) || option.value.toLowerCase().startsWith(needle))
        : staticOptions;
      requestGeneration.current += 1;
      setOptions(matches);
      setHasMore(false);
      setFailed(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (!source) return;
    const append = offset > 0;
    const generation = ++requestGeneration.current;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const result = await fetchLovOptions(source, query, offset);
      if (generation !== requestGeneration.current) return;
      if (!result.ok) {
        if (!append) setOptions([]);
        setHasMore(false);
        setFailed(true);
        return;
      }
      setFailed(false);
      setOptions((current) => (append ? [...current, ...result.options] : result.options));
      setHasMore(result.hasMore);
    } catch {
      if (generation !== requestGeneration.current) return;
      if (!append) setOptions([]);
      setHasMore(false);
      setFailed(true);
    } finally {
      if (generation === requestGeneration.current) {
        if (append) setLoadingMore(false); else setLoading(false);
      }
    }
  }, [source, staticOptions]);

  const openList = useCallback((query: string) => {
    if (disabled || openRef.current) return;
    openRef.current = true;
    setOpen(true);
    popoverRef.current?.showPopover();
    position();
    void runQuery(query);
  }, [disabled, position, runQuery]);

  /** The arrow's action: show the values, or dismiss them if already shown. */
  function toggleList() {
    if (disabled) return;
    if (openRef.current) { closeList(); return; }
    // Focusing first means the keyboard lands in the field the arrow belongs
    // to; its onFocus may already open the list, and openList then no-ops.
    inputRef.current?.focus();
    openList(text.trim());
  }

  // Debounce typing so a query runs per pause, not per keystroke.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => { void runQuery(text.trim()); }, 250);
    return () => window.clearTimeout(timer);
    // `open` intentionally excluded: opening already runs its own immediate
    // query, and including it would fire a second one on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, runQuery]);

  // Keep the panel under its input while the page moves beneath it.
  useEffect(() => {
    if (!open) return;
    const reposition = () => position();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, position]);

  /** Pulls the next page once the user nears the bottom of the dropdown. */
  function onListScroll(event: React.UIEvent<HTMLDivElement>) {
    const { count, hasMore: more, loading: busy, query } = loadedRef.current;
    if (!more || busy) return;
    const el = event.currentTarget;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 24) return;
    void runQuery(query, count);
  }

  function choose(option: LovOption) {
    setValue(option.value);
    setText(option.label);
    closeList();
    onSelect?.(option);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) { openList(text.trim()); return; }
      setActiveIndex((current) => (options.length === 0 ? -1 : (current + 1) % options.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open || options.length === 0) return;
      setActiveIndex((current) => (current <= 0 ? options.length - 1 : current - 1));
      return;
    }
    if (event.key === "Enter") {
      if (open && activeIndex >= 0 && options[activeIndex]) {
        event.preventDefault();
        choose(options[activeIndex]);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeList();
      return;
    }
    if (event.key === "Tab" && open) closeList();
  }

  return (
    <>
      {/*
        Submits the PICKED value, or — when nothing was picked — the raw text
        the user typed. Sending the raw text on purpose is what lets the
        database reject it: the field's foreign key names the bad value and
        blocks the write, instead of this component quietly substituting an
        empty value or refusing to submit at all. See the file header.
      */}
      {name && <input type="hidden" name={name} form={formId} value={value || text.trim()} readOnly />}
      <span className="relative block w-full">
        <input
          ref={inputRef}
          form={formId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={popoverId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          autoComplete="off"
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            // Typing invalidates any previous pick until a new one is chosen.
            if (value) { setValue(""); onSelect?.(null); }
            setActiveIndex(-1);
            // Typing always reveals the list, even if it was dismissed with Esc.
            openList(event.target.value.trim());
          }}
          onFocus={() => openList(text.trim())}
          onKeyDown={onKeyDown}
          // pr-7 reserves the arrow's column so long values never run under it.
          className={`${className} pr-7`}
        />
        <button
          type="button"
          // Keeps focus in the input, so opening by arrow and opening by typing
          // leave the keyboard in the same place.
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleList}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-stone-400 hover:text-stone-600 disabled:opacity-40 dark:text-stone-500 dark:hover:text-stone-300"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}>
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      </span>
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        role="listbox"
        onScroll={onListScroll}
        onToggle={(event) => {
          // Light dismiss (outside click / Esc) closes the popover directly,
          // so mirror that back into state instead of tracking it separately.
          if ((event as unknown as { newState?: string }).newState === "closed") {
            openRef.current = false;
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
        className="fixed z-[130] m-0 max-h-64 w-max max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-2xl dark:border-stone-700 dark:bg-stone-900"
      >
        {loading && options.length === 0 && (
          <p className="px-3 py-2 text-sm text-stone-500 dark:text-stone-400">Searching…</p>
        )}
        {/*
          A quiet, in-place note — never a toast. Typing something that does
          not exist yet is a normal intermediate state, not a failure; the
          error belongs on save, from the database.
        */}
        {!loading && options.length === 0 && (
          <p className="px-3 py-2 text-sm text-stone-500 dark:text-stone-400">
            {failed ? "Options could not be loaded." : "No matches."}
          </p>
        )}
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            // The input keeps focus while the list is open, so commit on
            // mousedown — a click would land after blur has already closed it.
            onMouseDown={(event) => { event.preventDefault(); choose(option); }}
            onMouseEnter={() => setActiveIndex(index)}
            className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm ${
              index === activeIndex
                ? "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100"
                : "text-stone-700 dark:text-stone-200"
            }`}
          >
            <span className="font-medium">{option.label}</span>
            {option.description && (
              <span className="text-xs text-stone-500 dark:text-stone-400">{option.description}</span>
            )}
          </button>
        ))}
        {loadingMore && (
          <p className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">Loading more…</p>
        )}
      </div>
    </>
  );
}
