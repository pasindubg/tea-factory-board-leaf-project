"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { MODULE_GROUP_ORDER, type ModuleDef } from "@/lib/roles";

// Section hub pages — each group header in the sidebar navigates here instead
// of expanding to show sub-items. This keeps the sidebar compact as modules grow;
// sub-navigation lives on the hub page itself (pattern shared with Auction).
const SECTION_HREF: Record<string, string> = {
  "Leaf Handling": "/dashboard/leaf-handling",
  "Sales Handling": "/dashboard/auction",
};

export function SidebarNav({ items }: { items: readonly ModuleDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending]);

  function navigate(href: string) {
    setPendingHref(href);
    startTransition(() => router.push(href));
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
        {item.label}
        {isLoading && (
          <span className="ml-auto h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
      </button>
    );
  }

  // Build a map of group → modules for active-section detection.
  const groupModules = new Map<string, ModuleDef[]>();
  for (const item of items) {
    if (item.group) {
      const arr = groupModules.get(item.group) ?? [];
      arr.push(item);
      groupModules.set(item.group, arr);
    }
  }

  const ungrouped = items.filter((i) => !i.group);

  return (
    <nav className="space-y-1">
      {ungrouped.map(renderItem)}
      {MODULE_GROUP_ORDER.map((group) => {
        const gItems = groupModules.get(group);
        if (!gItems || gItems.length === 0) return null;
        const href = SECTION_HREF[group] ?? gItems[0].href;
        // The section link is active when the user is on the hub page itself
        // *or* on any page belonging to a module in this group.
        const isActive =
          pathname.startsWith(href) ||
          gItems.some((m) =>
            m.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(m.href),
          );
        const isLoading = isPending && pendingHref === href;
        return (
          <button
            key={group}
            onClick={() => navigate(href)}
            className={`flex w-full items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-green-50 text-green-800"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            } ${isLoading ? "opacity-60" : ""}`}
          >
            {group}
            {isLoading && (
              <span className="ml-auto h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
