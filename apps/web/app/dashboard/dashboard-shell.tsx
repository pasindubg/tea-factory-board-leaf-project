"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import { SettingsMenu } from "@/components/settings-menu";
import { NavigationProgress } from "@/components/navigation-progress";
import { ActionFeedback } from "@/components/action-feedback";
import Link from "next/link";
import type { ModuleDef } from "@/lib/roles";
import { SidebarNav } from "./sidebar-nav";
import { groupForSectionSlug, sectionSlugForGroup } from "./section-routes";
import { moduleForPath } from "./navigation-matches";

const STORAGE_KEY = "dashboard-sidebar-collapsed";

export function DashboardShell({
  factoryName,
  factoryLogoUrl,
  profileName,
  profileRole,
  nav,
  children,
}: {
  factoryName: string;
  factoryLogoUrl: string | null;
  profileName: string;
  profileRole: string;
  nav: readonly ModuleDef[];
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname() ?? "";

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="dashboard-app flex h-dvh overflow-hidden">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-stone-950/30 backdrop-blur-[2px] lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[18rem] shrink-0 flex-col border-r border-stone-200/70 bg-white/95 shadow-2xl backdrop-blur-xl transition-transform duration-200 dark:border-stone-700/70 dark:bg-stone-900/95 lg:relative lg:z-auto lg:shadow-none print:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${
          collapsed ? "lg:w-0 lg:overflow-visible lg:border-r-0" : "lg:w-64"
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`absolute top-5 z-20 hidden h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-600 shadow-md hover:bg-green-50 hover:text-green-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-green-950 dark:hover:text-green-300 lg:inline-flex ${
            collapsed ? "left-3" : "-right-4"
          }`}
          aria-label={collapsed ? "Show sidebar" : "Collapse sidebar"}
          title={collapsed ? "Show sidebar" : "Collapse sidebar"}
        >
          <span aria-hidden="true" className={`text-base leading-none ${collapsed ? "" : "rotate-180"}`}>
            ›
          </span>
        </button>

        <div className={collapsed ? "flex h-full flex-col lg:hidden" : "flex h-full flex-col"}>
          <div className="border-b border-stone-200/70 px-5 py-5 dark:border-stone-700/70">
            {factoryLogoUrl ? (
              <Image
                src={factoryLogoUrl}
                alt={`${factoryName} profile`}
                width={44}
                height={44}
                unoptimized
                className="mb-3 h-11 w-11 rounded-2xl border border-stone-200 object-cover shadow-sm dark:border-stone-700"
              />
            ) : (
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-green-700 text-lg font-bold text-white shadow-sm dark:bg-green-500 dark:text-green-950">T</div>
            )}
            <p className="truncate text-base font-semibold tracking-tight text-green-900 dark:text-green-300">{factoryName}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <SidebarNav items={nav} />
          </div>
          <div className="border-t border-stone-200/70 bg-stone-50/70 p-4 dark:border-stone-700/70 dark:bg-stone-950/20">
            <SettingsMenu />
            <div className="my-3 border-t border-stone-200/70 dark:border-stone-700/70" />
            <p className="text-sm font-medium text-stone-700 dark:text-stone-300">{profileName}</p>
            <p className="text-xs capitalize text-stone-500 dark:text-stone-400">{profileRole}</p>
            <div className="mt-3 space-y-2">
              <form action="/auth/signout" method="post">
                <button className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-800">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-stone-200/70 bg-white/75 px-4 backdrop-blur-xl dark:border-stone-800/70 dark:bg-stone-950/70 lg:hidden print:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-stone-700 hover:bg-green-50 hover:text-green-800 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300"
          >
            <span aria-hidden="true" className="text-2xl leading-none">☰</span>
          </button>
          {factoryLogoUrl && (
            <Image
              src={factoryLogoUrl}
              alt=""
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 shrink-0 rounded-xl border border-stone-200 object-cover dark:border-stone-700"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{factoryName}</p>
            <p className="text-xs capitalize text-stone-500 dark:text-stone-400">{profileRole}</p>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="dashboard-content">
            <DashboardBreadcrumbs pathname={pathname} nav={nav} />
            {children}
          </div>
        </main>
      </section>
      <UrlToast />
      <ActionFeedback />
      <NavigationProgress />
    </div>
  );
}

function DashboardBreadcrumbs({ pathname, nav }: { pathname: string; nav: readonly ModuleDef[] }) {
  if (pathname === "/dashboard") return null;

  const sectionSlug = pathname.match(/^\/dashboard\/sections\/([^/]+)/)?.[1];
  const routeGroup = groupForSectionSlug(sectionSlug);
  const currentModule = moduleForPath(nav, pathname);
  const group = routeGroup ?? currentModule?.group ?? null;
  const currentLabel = pathname === "/dashboard/settings"
    ? "My settings"
    : routeGroup ?? currentModule?.label ?? "Current page";

  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex min-h-8 flex-wrap items-center gap-2 text-sm">
      <Link href="/dashboard" className="font-medium text-green-800 hover:underline dark:text-green-300">Overview</Link>
      <span aria-hidden="true" className="text-stone-400">/</span>
      {group && !routeGroup && (
        <>
          <Link href={`/dashboard/sections/${sectionSlugForGroup(group)}`} className="font-medium text-green-800 hover:underline dark:text-green-300">{group}</Link>
          <span aria-hidden="true" className="text-stone-400">/</span>
        </>
      )}
      <span aria-current="page" className="font-medium text-stone-500 dark:text-stone-400">{currentLabel}</span>
    </nav>
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
      className={`fixed bottom-5 right-5 z-[120] max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl ${
        kind === "error"
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
      }`}
    >
      {visibleMessage}
    </div>
  );
}
