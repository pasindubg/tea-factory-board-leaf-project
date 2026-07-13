"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { startNavigationFeedback } from "@/components/navigation-progress";

const tabs = [
  { href: "/dashboard/payments", label: "Statements", exact: true },
  { href: "/dashboard/payments/tiers", label: "Quality tiers" },
  { href: "/dashboard/payments/adjustments", label: "Advances & deductions" },
  { href: "/dashboard/payments/settings", label: "Settings" },
];

export function PaymentsNav() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending]);

  function navigate(href: string, trigger?: HTMLButtonElement) {
    setPendingHref(href);
    startNavigationFeedback(trigger);
    startTransition(() => router.push(href));
  }

  return (
    <nav className="mb-6 flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-stone-100 p-1.5 dark:bg-stone-900">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const isLoading = isPending && pendingHref === t.href;
        return (
          <button
            key={t.href}
            onClick={(event) => navigate(t.href, event.currentTarget)}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-sm transition-all ${
              active
                ? "bg-white font-medium text-green-800 shadow-sm dark:bg-stone-800 dark:text-green-300"
                : "text-stone-600 hover:bg-white/60 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100"
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
