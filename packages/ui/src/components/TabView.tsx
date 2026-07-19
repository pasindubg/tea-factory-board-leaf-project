"use client";

import * as React from "react";

export type TabViewTab = {
  id: string;
  label: React.ReactNode;
  content: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
};

export interface TabViewProps {
  tabs: TabViewTab[];
  /** Accessible name for the tab bar. */
  label?: string;
  /** Initially selected tab when the component is uncontrolled. */
  defaultTabId?: string;
  /** Selected tab for controlled usage. */
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
  tabListClassName?: string;
}

/** Accessible tabs for related work surfaces, such as two or more list tables. */
export function TabView({
  tabs,
  label = "Sections",
  defaultTabId,
  activeTabId,
  onTabChange,
  className = "",
  tabListClassName = "",
}: TabViewProps) {
  const firstEnabledId = tabs.find((tab) => !tab.disabled)?.id ?? tabs[0]?.id ?? "";
  const [internalTabId, setInternalTabId] = React.useState(() => {
    const initial = defaultTabId && tabs.some((tab) => tab.id === defaultTabId && !tab.disabled)
      ? defaultTabId
      : firstEnabledId;
    return initial;
  });
  const selectedTabId = activeTabId ?? internalTabId;
  const tabSetId = React.useId().replace(/:/g, "");
  // The package deliberately compiles without the DOM lib. React supplies the
  // button node at runtime, so retain only the capability this component needs.
  const tabRefs = React.useRef(new Map<string, { focus?: () => void }>());

  function activate(tabId: string, focus = false) {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab || tab.disabled) return;
    if (activeTabId === undefined) setInternalTabId(tabId);
    onTabChange?.(tabId);
    if (focus) tabRefs.current.get(tabId)?.focus?.();
  }

  function moveFrom(currentIndex: number, direction: 1 | -1) {
    if (tabs.length === 0) return;
    for (let offset = 1; offset <= tabs.length; offset += 1) {
      const next = tabs[(currentIndex + direction * offset + tabs.length) % tabs.length];
      if (!next.disabled) {
        activate(next.id, true);
        return;
      }
    }
  }

  function firstOrLast(direction: 1 | -1) {
    const candidates = direction === 1 ? tabs : [...tabs].reverse();
    const next = candidates.find((tab) => !tab.disabled);
    if (next) activate(next.id, true);
  }

  if (tabs.length === 0) return null;

  return (
    <section className={["space-y-3", className].filter(Boolean).join(" ")}>
      <div
        role="tablist"
        aria-label={label}
        className={["flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50 p-1.5 shadow-sm dark:border-stone-700 dark:bg-stone-900", tabListClassName].filter(Boolean).join(" ")}
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === selectedTabId;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node as unknown as { focus?: () => void });
                else tabRefs.current.delete(tab.id);
              }}
              id={`${tabSetId}-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${tabSetId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => activate(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") moveFrom(index, 1);
                else if (event.key === "ArrowLeft") moveFrom(index, -1);
                else if (event.key === "Home") firstOrLast(1);
                else if (event.key === "End") firstOrLast(-1);
                else return;
                event.preventDefault();
              }}
              className={[
                "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "bg-white text-green-800 shadow-sm dark:bg-stone-800 dark:text-green-300"
                  : "text-stone-600 hover:bg-white/70 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100",
              ].join(" ")}
            >
              {tab.label}
              {tab.badge && <span className={selected ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-950 dark:text-green-300" : "rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600 dark:bg-stone-700 dark:text-stone-300"}>{tab.badge}</span>}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${tabSetId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${tabSetId}-tab-${tab.id}`}
          hidden={tab.id !== selectedTabId}
        >
          {tab.content}
        </div>
      ))}
    </section>
  );
}
