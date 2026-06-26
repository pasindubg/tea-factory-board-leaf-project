import * as React from "react";

export type AlertVariant = "error" | "success" | "warning" | "info";

const variantClasses: Record<AlertVariant, string> = {
  error: "bg-red-50 text-red-700 border-red-200",
  success: "bg-green-50 text-green-800 border-green-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-stone-50 text-stone-700 border-stone-200",
};

export interface AlertProps {
  variant?: AlertVariant;
  children: React.ReactNode;
  className?: string;
}

export function Alert({ variant = "info", children, className = "" }: AlertProps) {
  const role = variant === "error" ? "alert" : "status";
  return (
    <div
      role={role}
      className={[
        "rounded-md border px-4 py-3 text-sm",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
