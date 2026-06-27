import * as React from "react";

export interface FormCardProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "full";
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  full: "w-full",
};

export function FormCard({
  children,
  className = "",
  maxWidth = "lg",
}: FormCardProps) {
  return (
    <div
      className={[
        "space-y-4 rounded-xl border border-stone-200 bg-white p-6",
        maxWidthClasses[maxWidth],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
