"use client";

import { usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { MODULE_GROUP_ORDER, type ModuleDef, type ModuleGroup } from "@/lib/roles";
import { groupForSectionSlug, sectionSlugForGroup } from "./section-routes";
import { AppNavLink } from "@/components/ui/navigation";

export function SidebarNav({ items }: { items: readonly ModuleDef[] }) {
  const pathname = usePathname() ?? "";

  const itemMatches = useCallback((item: ModuleDef): boolean => {
    if (item.key === "auction-sale-detail") return pathname.startsWith("/dashboard/auction/sales/");
    if (item.key === "auction-sales") return pathname === "/dashboard/auction/sales";
    if (item.key === "auction-reprints") return pathname === "/dashboard/auction/reprints";
    if (item.key === "auction-dispatch-detail") {
      return pathname.startsWith("/dashboard/auction/") &&
        !pathname.startsWith("/dashboard/auction/dashboard") &&
        !pathname.startsWith("/dashboard/auction/sales") &&
        !pathname.startsWith("/dashboard/auction/reprints") &&
        !pathname.startsWith("/dashboard/auction/reports") &&
        !pathname.startsWith("/dashboard/auction/registry") &&
        !pathname.startsWith("/dashboard/auction/settings") &&
        !pathname.startsWith("/dashboard/auction/new") &&
        pathname !== "/dashboard/auction";
    }
    if (item.key === "auction") return pathname === "/dashboard/auction" || pathname.startsWith("/dashboard/auction/new");
    if (item.key === "overview") return pathname === "/dashboard";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }, [pathname]);

  const groupModules = useMemo(() => {
    const map = new Map<ModuleGroup, ModuleDef[]>();
    for (const item of items) {
      if (!item.group) continue;
      map.set(item.group, [...(map.get(item.group) ?? []), item]);
    }
    return map;
  }, [items]);

  const sectionSlug = pathname.match(/^\/dashboard\/sections\/([^/]+)/)?.[1];
  const sectionRouteGroup = groupForSectionSlug(sectionSlug);
  const activeItemGroup = items.find((item) => item.group && itemMatches(item))?.group ?? null;
  const selectedGroup = sectionRouteGroup ?? activeItemGroup;
  const ungrouped = items.filter((item) => !item.group);

  function renderItem(item: ModuleDef) {
    const active = itemMatches(item);
    return (
      <AppNavLink
        key={item.key}
        href={item.href}
        data-module-key={item.key}
        active={active}
      >
        <span className="flex-1 text-left">{item.label}</span>
      </AppNavLink>
    );
  }

  if (selectedGroup) {
    const groupItems = groupModules.get(selectedGroup) ?? [];
    return (
      <nav aria-label={`${selectedGroup} navigation`}>
        <AppNavLink href="/dashboard" compact className="mb-3 gap-2 bg-transparent text-green-800 dark:text-green-300">
          <span aria-hidden="true">‹</span>
          Overview
        </AppNavLink>
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">{selectedGroup}</p>
        <div className="space-y-1.5">{groupItems.map(renderItem)}</div>
      </nav>
    );
  }

  return (
    <nav aria-label="Main navigation" className="space-y-1">
      {ungrouped.map(renderItem)}
      {MODULE_GROUP_ORDER.map((group) => {
        if (!(groupModules.get(group)?.length)) return null;
        return (
          <AppNavLink
            key={group}
            href={`/dashboard/sections/${sectionSlugForGroup(group)}`}
            className="rounded-full bg-transparent font-medium text-stone-600 dark:text-stone-400"
          >
            <span className="flex-1 text-left">{group}</span>
            <span aria-hidden="true" className="text-base">›</span>
          </AppNavLink>
        );
      })}
    </nav>
  );
}
