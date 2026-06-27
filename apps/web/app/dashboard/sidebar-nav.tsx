"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { MODULE_GROUP_ORDER, type ModuleDef } from "@/lib/roles";

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

  const ungrouped = items.filter((i) => !i.group);

  return (
    <nav className="space-y-1">
      {ungrouped.map(renderItem)}
      {MODULE_GROUP_ORDER.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} className="pt-4">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
              {group}
            </p>
            <div className="space-y-1">{groupItems.map(renderItem)}</div>
          </div>
        );
      })}
    </nav>
  );
}
