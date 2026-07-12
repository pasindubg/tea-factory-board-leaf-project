"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-green-700 text-white hover:bg-green-800 dark:bg-green-600 dark:text-white dark:hover:bg-green-500",
  secondary: "border-stone-300 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800",
  danger: "border-transparent bg-red-700 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500",
  ghost: "border-transparent bg-transparent text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 rounded-xl px-3 text-xs",
  md: "min-h-11 rounded-xl px-4 text-sm",
  icon: "h-10 w-10 rounded-full p-0",
};

export function AppButton({
  variant = "secondary",
  size = "md",
  busy = false,
  busyLabel = "Working…",
  className = "",
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; busy?: boolean; busyLabel?: string; children: ReactNode }) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 border font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-stone-950 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {busy && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {busy ? busyLabel : children}
    </button>
  );
}

