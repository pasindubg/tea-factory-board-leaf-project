"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";

const tabs = [
  { href: "/dashboard/auction", label: "Sales", match: (p: string) => p === "/dashboard/auction" || p.startsWith("/dashboard/auction/") && !p.startsWith("/dashboard/auction/registry") },
  { href: "/dashboard/auction/registry", label: "Brokers & marks", match: (p: string) => p.startsWith("/dashboard/auction/registry") },
];

export function AuctionNav() {
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

  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-stone-200">
      {tabs.map((t) => {
        const active = t.match(pathname);
        const isLoading = isPending && pendingHref === t.href;
        return (
          <button
            key={t.href}
            onClick={() => navigate(t.href)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-opacity ${
              active
                ? "border-green-700 font-medium text-green-800"
                : "border-transparent text-stone-600 hover:text-stone-900"
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
