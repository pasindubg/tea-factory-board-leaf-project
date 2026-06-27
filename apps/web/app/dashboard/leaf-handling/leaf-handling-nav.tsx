"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { MODULES } from "@/lib/roles";

// Sub-navigation for the Leaf Handling hub. Lists every module in the
// "Leaf Handling" group — same data source as the old sidebar, rendered
// as horizontal tabs so the sidebar stays compact as modules grow.

const tabs = MODULES.filter((m) => m.group === "Leaf Handling").map((m) => ({
  href: m.href,
  label: m.label,
}));

export function LeafHandlingNav() {
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
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
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
