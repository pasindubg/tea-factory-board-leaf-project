"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState, useEffect, useCallback, useMemo } from "react";
import { MODULE_GROUP_ORDER, type ModuleDef } from "@/lib/roles";

export function SidebarNav({ items }: { items: readonly ModuleDef[] }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const itemMatches = useCallback((item: ModuleDef): boolean => {
    if (item.key === "auction-sale-detail") {
      return pathname.startsWith("/dashboard/auction/sales/");
    }
    if (item.key === "auction-sales") {
      return pathname === "/dashboard/auction/sales";
    }
    if (item.key === "auction-dispatch-detail") {
      return pathname.startsWith("/dashboard/auction/") &&
        !pathname.startsWith("/dashboard/auction/dashboard") &&
        !pathname.startsWith("/dashboard/auction/sales") &&
        !pathname.startsWith("/dashboard/auction/reports") &&
        !pathname.startsWith("/dashboard/auction/registry") &&
        !pathname.startsWith("/dashboard/auction/new") &&
        pathname !== "/dashboard/auction";
    }
    if (item.key === "auction") {
      return pathname === "/dashboard/auction" || pathname.startsWith("/dashboard/auction/new");
    }
    if (item.key === "overview") return pathname === "/dashboard";
    return pathname.startsWith(item.href);
  }, [pathname]);

  // Build a stable set of active groups from the current pathname.
  // Only the longest-matching item per group counts as active.
  const activeGroups = useMemo(() => {
    const s = new Set<string>();
    const best = new Map<string, number>();
    for (const item of items) {
      if (item.group && itemMatches(item)) {
        const prev = best.get(item.group) ?? 0;
        if (item.href.length > prev) best.set(item.group, item.href.length);
      }
    }
    for (const [group] of best) s.add(group);
    return s;
  }, [items, itemMatches]);

  // Track which sections are manually expanded/collapsed.
  // Auto-expand any section that contains the currently active page.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(activeGroups));

  // Keep auto-expand in sync with pathname changes (e.g. browser back/forward).
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const g of activeGroups) next.add(g);
      // Also auto-expand sub-groups that contain the active item
      for (const item of items) {
        if (item.subGroup && itemMatches(item)) {
          next.add(`sg:${item.subGroup}`);
        }
      }
      return next;
    });
  }, [activeGroups, items, itemMatches]);

  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending]);

  const navigate = useCallback(
    (href: string) => {
      setPendingHref(href);
      startTransition(() => router.push(href));
    },
    [router, startTransition],
  );

  function toggleSection(group: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function renderItem(item: ModuleDef, activeOverride?: boolean) {
    const isActive = activeOverride ?? itemMatches(item);
    const isLoading = isPending && pendingHref === item.href;
    // Detail entries are indicators only — navigation happens from overview lists.
    const nonNavigable = (item.key === "auction-dispatch-detail" || item.key === "auction-sale-detail") && !isActive;
    return (
      <button
        key={item.key}
        onClick={nonNavigable ? undefined : () => navigate(item.href)}
        className={`flex w-full items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-400"
            : nonNavigable
              ? "text-stone-400 dark:text-stone-500 cursor-default"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        } ${isLoading ? "opacity-60" : ""}`}
      >
        <span className="flex-1 text-left">{item.label}</span>
        {isLoading && (
          <span className="ml-auto h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
      </button>
    );
  }

  // Build a map of group → modules.
  const groupModules = useMemo(() => {
    const map = new Map<string, ModuleDef[]>();
    for (const item of items) {
      if (item.group) {
        const arr = map.get(item.group) ?? [];
        arr.push(item);
        map.set(item.group, arr);
      }
    }
    return map;
  }, [items]);

  const ungrouped = useMemo(() => items.filter((i) => !i.group), [items]);

  return (
    <nav className="space-y-1">
      {ungrouped.map((item) => renderItem(item))}

      {MODULE_GROUP_ORDER.map((group) => {
        const gItems = groupModules.get(group);
        if (!gItems || gItems.length === 0) return null;

        const isExpanded = expanded.has(group);
        const sectionActive = activeGroups.has(group);

        return (
          <div key={group}>
            <button
              onClick={() => toggleSection(group)}
              className={`flex w-full items-center rounded-r-md px-3 py-2 text-sm font-medium transition-colors ${
                isExpanded
                  ? "border-l-3 border-green-500 text-stone-600 dark:border-green-400 dark:text-stone-400"
                  : sectionActive
                    ? "border-l-3 border-green-500 text-green-800 dark:border-green-400 dark:text-green-400"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              }`}
            >
              <span className="flex-1 text-left">{group}</span>
              <span
                className={`ml-1 text-xs transition-transform duration-150 ${
                  isExpanded ? "rotate-90" : ""
                }`}
              >
                ›
              </span>
            </button>
            {isExpanded && (
              <div className="ml-3 mt-0.5 space-y-1 border-l-2 border-stone-200 pl-2 dark:border-stone-700">
                {(() => {
                  // Split items by subGroup: those without render flat, those
                  // with a subGroup render under a nested expandable toggle.
                  const subGroups = new Map<string, ModuleDef[]>();
                  const flat: ModuleDef[] = [];
                  for (const item of gItems) {
                    if (item.subGroup) {
                      const arr = subGroups.get(item.subGroup) ?? [];
                      arr.push(item);
                      subGroups.set(item.subGroup, arr);
                    } else {
                      flat.push(item);
                    }
                  }

                  // Best match detection for flat items
                  let bestIdx = -1, bestLen = 0;
                  for (let i = 0; i < flat.length; i++) {
                    const m = itemMatches(flat[i]);
                    if (m && flat[i].href.length > bestLen) { bestIdx = i; bestLen = flat[i].href.length; }
                  }

                  return (
                    <>
                      {flat.map((item, i) => renderItem(item, i === bestIdx ? true : false))}
                      {[...subGroups.entries()].map(([sgName, sgItems]) => {
                        const sgActive = sgItems.some((m) => itemMatches(m));
                        const sgExpanded = expanded.has(`sg:${sgName}`);
                        return (
                          <div key={sgName}>
                            <button
                              onClick={() => toggleSection(`sg:${sgName}`)}
                              className={`flex w-full items-center rounded-r-md px-2 py-1.5 text-xs font-medium transition-colors ${
                                sgActive && !sgExpanded
                                  ? "text-green-700 dark:text-green-400"
                                  : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
                              }`}
                            >
                              <span className="flex-1 text-left">{sgName}</span>
                              <span className={`ml-1 text-[10px] transition-transform ${sgExpanded ? "rotate-90" : ""}`}>›</span>
                            </button>
                            {sgExpanded && (
                              <div className="ml-2 mt-0.5 space-y-1 border-l border-stone-200 pl-2 dark:border-stone-700">
                                {(() => {
                                  let bi = -1, bl = 0;
                                  for (let i = 0; i < sgItems.length; i++) {
                                    const m = itemMatches(sgItems[i]);
                                    if (m && sgItems[i].href.length > bl) { bi = i; bl = sgItems[i].href.length; }
                                  }
                                  return sgItems.map((item, i) => renderItem(item, i === bi ? true : false));
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
