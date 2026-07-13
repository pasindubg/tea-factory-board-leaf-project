"use client";

import { useEffect, type ReactNode } from "react";
import { AppButton } from "./button";

export function AppDrawer({ open, title, description, onClose, children, widthClass = "max-w-2xl" }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; widthClass?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <>
      <button type="button" aria-label={`Close ${title}`} onClick={onClose} className="fixed inset-0 z-[80] cursor-default bg-stone-950/30 backdrop-blur-[1px]" />
      <aside role="dialog" aria-modal="true" aria-label={title} className={`fixed right-4 top-4 z-[90] flex h-[calc(100dvh-2rem)] w-[min(42rem,calc(100vw-2rem))] ${widthClass} flex-col overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-950`}>
        <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-6 py-5 dark:border-stone-800">
          <div>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{title}</h2>
            {description && <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{description}</p>}
          </div>
          <AppButton type="button" variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${title}`}>×</AppButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </>
  );
}
