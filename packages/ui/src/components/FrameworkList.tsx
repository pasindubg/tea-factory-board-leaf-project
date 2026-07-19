"use client";

import * as React from "react";
import { Button } from "./Button";

export interface FrameworkListProps {
  /** Short name for the record collection shown by this list. */
  title?: React.ReactNode;
  /** Supporting text rendered below the title. */
  description?: React.ReactNode;
  /** Called when the built-in New button is selected. Omit to hide it. */
  onCreate?: () => void;
  /** Controls whether the built-in New button is available. */
  canCreate?: boolean;
  /** Native tooltip shown when creation is unavailable. */
  createDisabledReason?: string;
  /** Label for the built-in create action. */
  createLabel?: string;
  /** Slot for search, export, bulk, or other list-level actions. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}

/**
 * Shared frame for an operational list. It standardizes the header and create
 * affordance while leaving table markup, filters, selection, and domain
 * commands to the application list framework.
 */
export function FrameworkList({
  title,
  description,
  onCreate,
  canCreate = true,
  createDisabledReason,
  createLabel = "New",
  actions,
  children,
  className = "",
  headerClassName = "",
}: FrameworkListProps) {
  const hasHeader = title || description || actions || onCreate;
  const disabledReasonId = React.useId();

  return (
    <section className={["overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900", className].filter(Boolean).join(" ")}>
      {hasHeader && (
        <header className={["flex min-h-16 items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/70 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60", headerClassName].filter(Boolean).join(" ")}>
          {(title || description) && (
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{description}</p>}
            </div>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {actions}
            {onCreate && (
              <span title={!canCreate ? createDisabledReason : undefined}>
                <Button
                  type="button"
                  size="sm"
                  onClick={onCreate}
                  disabled={!canCreate}
                  aria-label={createLabel}
                  aria-describedby={!canCreate && createDisabledReason ? disabledReasonId : undefined}
                >
                  <span aria-hidden="true" className="text-base leading-none">+</span>
                  {createLabel}
                </Button>
                {!canCreate && createDisabledReason && (
                  <span id={disabledReasonId} className="sr-only">{createDisabledReason}</span>
                )}
              </span>
            )}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}
