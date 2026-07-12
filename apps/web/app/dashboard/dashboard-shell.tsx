"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
            <div
              className="mt-1 inline-flex skew-x-[-8deg] overflow-hidden rounded-[1px] border border-stone-950 bg-stone-950 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] dark:border-white dark:bg-white dark:text-stone-950 dark:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.16)]"
              aria-label="DCT Enterprise"
            >
              <span className="skew-x-[8deg] px-1.5 py-0.5 text-[12px] font-black leading-none tracking-[0.08em]">DCT</span>
              <span className="skew-x-[8deg] border-l border-white/30 px-1.5 py-0.5 text-[8px] font-black leading-none tracking-[0.14em] dark:border-stone-950/30">
                ENTERPRISE
              </span>
            </div>
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
      <UrlToast />
    </div>
  );
}

function UrlToast() {
  const searchParams = useSearchParams();
  const message = searchParams.get("error") || searchParams.get("notice");
  const kind = searchParams.get("error") ? "error" : "notice";
  const [visibleMessage, setVisibleMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    setVisibleMessage(message);
    const timer = window.setTimeout(() => setVisibleMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!visibleMessage) return null;

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`fixed bottom-5 left-5 z-[80] max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
        kind === "error"
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
      }`}
    >
      {visibleMessage}
    </div>
  );
}
