"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Suppress rendering until after hydration to prevent the server/client
  // text mismatch that occurs because useTheme() can differ between SSR
  // (which doesn't know the stored preference) and the client.
  if (!mounted) {
    return (
      <button
        className="min-h-11 w-full rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-600 dark:border-stone-600 dark:text-stone-400"
        disabled
      >
        &nbsp;
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="min-h-11 w-full rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
      aria-label="Toggle theme"
    >
      {isDark ? "☀️ Light mode" : "🌙 Dark mode"}
    </button>
  );
}
