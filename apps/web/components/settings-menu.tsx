"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

const THEMES = [
  { value: "system", label: "System", icon: "◐" },
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
] as const;

export function SettingsMenu() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <details className="group relative">
      <summary className="flex min-h-11 w-full cursor-pointer list-none items-center gap-3 rounded-full border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true">⚙</span>
        <span className="flex-1 text-left">Settings</span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌃</span>
      </summary>
      <div className="absolute bottom-14 left-0 z-50 w-64 rounded-[1.5rem] border border-stone-200 bg-white p-3 shadow-2xl dark:border-stone-700 dark:bg-stone-900">
          <div className="flex items-center justify-between px-2 pb-2">
            <div>
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Settings</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">App preferences</p>
            </div>
          </div>
          <div className="rounded-2xl bg-stone-100 p-2 dark:bg-stone-800">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Appearance</p>
            <div className="grid grid-cols-3 gap-1">
              {THEMES.map((option) => {
                const selected = mounted && theme === option.value;
                return (
                  <form key={option.value} action={`/theme/${option.value}`} method="post">
                    <button
                      type="submit"
                      aria-pressed={selected}
                      className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium ${
                        selected
                          ? "bg-white text-green-800 shadow-sm dark:bg-stone-700 dark:text-green-300"
                          : "text-stone-600 hover:bg-white/60 dark:text-stone-300 dark:hover:bg-stone-700/60"
                      }`}
                    >
                      <span aria-hidden="true" className="text-lg">{option.icon}</span>
                      {option.label}
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-2xl px-3 py-3 text-sm text-stone-500 dark:text-stone-400">
            <span>More preferences</span>
            <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide dark:bg-stone-800">Coming soon</span>
          </div>
      </div>
    </details>
  );
}
