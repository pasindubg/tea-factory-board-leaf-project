"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";

const tabs = [
  {
    href: "/dashboard/auction/dashboard",
    label: "Dashboard",
    match: (p: string) => p.startsWith("/dashboard/auction/dashboard"),
  },
  {
    href: "/dashboard/auction",
    label: "Dispatch Handling",
    match: (p: string) =>
      p === "/dashboard/auction" ||
      (p.startsWith("/dashboard/auction/") &&
        !p.startsWith("/dashboard/auction/dashboard") &&
        !p.startsWith("/dashboard/auction/sales") &&
        !p.startsWith("/dashboard/auction/reports") &&
        !p.startsWith("/dashboard/auction/registry") &&
        !p.startsWith("/dashboard/auction/settings")),
  },
  {
    href: "/dashboard/auction/sales",
    label: "Sales Handling",
    match: (p: string) => p.startsWith("/dashboard/auction/sales"),
  },
  {
    href: "/dashboard/auction/reports",
    label: "Report Reconciliations",
    match: (p: string) => p.startsWith("/dashboard/auction/reports"),
  },
  {
    href: "/dashboard/auction/registry",
    label: "Brokers & marks",
    match: (p: string) => p.startsWith("/dashboard/auction/registry"),
  },
  {
    href: "/dashboard/auction/settings",
    label: "Auction setup",
    match: (p: string) => p.startsWith("/dashboard/auction/settings"),
  },
];

export function AuctionNav() {
  const router = useRouter();
  // usePathname() can be null during some SSR/loading boundaries; the tab
  // matchers call .startsWith on it, so fall back to an empty string.
  const pathname = usePathname() ?? "";
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending]);

  function navigate(href: string) {
    setPendingHref(href);
    startTransition(() => router.push(href));
  }

  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-stone-200 dark:border-stone-700">
      {tabs.map((t) => {
        const active = t.match(pathname);
        const isLoading = isPending && pendingHref === t.href;
        return (
          <button
            key={t.href}
            onClick={() => navigate(t.href)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-opacity ${
              active
                ? "border-green-700 dark:border-green-500 font-medium text-green-800 dark:text-green-400"
                : "border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
            } ${isLoading ? "opacity-60" : ""}`}
          >
            {t.label}
            {isLoading && (
              <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
