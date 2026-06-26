import * as React from "react";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";

const sizeClasses: Record<SpinnerSize, string> = {
  xs: "h-3 w-3 border-2",
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-8 w-8 border-[3px]",
};

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

export function Spinner({ size = "sm", className = "", label = "Loading…" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={[
        "inline-block animate-spin rounded-full border-stone-300 border-t-stone-700",
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
