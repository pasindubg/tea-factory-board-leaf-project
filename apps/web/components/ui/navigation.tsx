import Link from "next/link";
import type { ComponentProps } from "react";

export function AppNavLink({ active = false, compact = false, className = "", children, ...props }: ComponentProps<typeof Link> & { active?: boolean; compact?: boolean }) {
  return (
    <Link
      {...props}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${compact ? "min-h-10 px-3 py-2 text-sm" : "min-h-11 px-4 py-2.5 text-sm"} ${
        active
          ? "bg-green-100 text-green-950 shadow-sm dark:bg-green-900 dark:text-green-100"
          : "bg-stone-100/60 text-stone-700 hover:bg-green-50 hover:text-green-900 dark:bg-stone-800/45 dark:text-stone-300 dark:hover:bg-green-950 dark:hover:text-green-200"
      } ${className}`}
    >
      {children}
    </Link>
  );
}

