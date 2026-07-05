"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ModuleDef } from "@/lib/roles";
import { SidebarNav } from "./sidebar-nav";

const STORAGE_KEY = "dashboard-sidebar-collapsed";

export function DashboardShell({
  factoryName,
  profileName,
  profileRole,
  nav,
  children,
}: {
  factoryName: string;
  profileName: string;
  profileRole: string;
  nav: readonly ModuleDef[];
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex h-screen bg-stone-50 dark:bg-stone-950">
      <aside
        className={`relative flex shrink-0 flex-col border-r border-stone-200 bg-white transition-[width] duration-200 dark:border-stone-700 dark:bg-stone-900 print:hidden ${
          collapsed ? "w-0 overflow-visible border-r-0" : "w-56"
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`absolute top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-600 shadow-sm hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 ${
            collapsed ? "left-3" : "-right-4"
          }`}
          aria-label={collapsed ? "Show sidebar" : "Collapse sidebar"}
          title={collapsed ? "Show sidebar" : "Collapse sidebar"}
        >
          <span aria-hidden="true" className={`text-base leading-none ${collapsed ? "" : "rotate-180"}`}>
            ›
          </span>
        </button>

        <div className={collapsed ? "hidden" : "flex h-full flex-col"}>
          <div className="border-b border-stone-200 p-4 dark:border-stone-700">
            <p className="text-sm font-semibold text-green-800 dark:text-green-400">{factoryName}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">Tea Factory Ops</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <SidebarNav items={nav} />
          </div>
          <div className="border-t border-stone-200 p-4 dark:border-stone-700">
            <p className="text-sm font-medium text-stone-700 dark:text-stone-300">{profileName}</p>
            <p className="text-xs capitalize text-stone-500 dark:text-stone-400">{profileRole}</p>
            <div className="mt-3 space-y-2">
              <ThemeToggle />
              <form action="/auth/signout" method="post">
                <button className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-800">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
