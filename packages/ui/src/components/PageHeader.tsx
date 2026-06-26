import * as React from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, className = "" }: PageHeaderProps) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-4 pb-6",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div>
        <h1 className="text-xl font-semibold text-stone-900">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
