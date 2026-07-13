"use client";

import { useState, type ReactNode } from "react";

const TABS = [
  { key: "overview", label: "Settlement overview" },
  { key: "upload", label: "Upload & review documents" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ReportsTabs({ overview, upload }: { overview: ReactNode; upload: ReactNode }) {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-stone-200 dark:border-stone-700">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-opacity ${
                active
                  ? "border-green-700 dark:border-green-500 font-medium text-green-800 dark:text-green-400"
                  : "border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "overview" ? overview : upload}
    </div>
  );
}
