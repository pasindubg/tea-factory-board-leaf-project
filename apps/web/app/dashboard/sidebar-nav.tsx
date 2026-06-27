"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState, useEffect, useCallback, useMemo } from "react";
import { MODULE_GROUP_ORDER, type ModuleDef } from "@/lib/roles";

export function SidebarNav({ items }: { items: readonly ModuleDef[] }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Build a stable set of active groups from the current pathname.
  const activeGroups = useMemo(() => {
    const s = new Set<string>();
    for (const item of items) {
      if (item.group && pathname.startsWith(item.href)) {
        s.add(item.group);
      }
    }
    return s;
  }, [items, pathname]);

  // Track which sections are manually expanded/collapsed.
  // Auto-expand any section that contains the currently active page.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(activeGroups));

  // Keep auto-expand in sync with pathname changes (e.g. browser back/forward).
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const g of activeGroups) next.add(g);
      return next;
    });
  }, [activeGroups]);

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

  function renderItem(item: ModuleDef) {
    const isActive =
      item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
    const isLoading = isPending && pendingHref === item.href;
    return (
      <button
        key={item.href}
        onClick={() => navigate(item.href)}
        className={`flex w-full items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "bg-green-50 text-green-800"
            : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
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
      {ungrouped.map(renderItem)}

      {MODULE_GROUP_ORDER.map((group) => {
        const gItems = groupModules.get(group);
        if (!gItems || gItems.length === 0) return null;

        const isExpanded = expanded.has(group);
        const isSectionActive = activeGroups.has(group);

        return (
          <div key={group}>
            <button
              onClick={() => toggleSection(group)}
              className={`flex w-full items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isSectionActive
                  ? "bg-green-50 text-green-800"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
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
              <div className="ml-3 mt-0.5 space-y-1 border-l-2 border-stone-200 pl-2">
                {gItems.map(renderItem)}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
