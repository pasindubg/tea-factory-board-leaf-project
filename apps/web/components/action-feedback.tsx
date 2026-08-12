"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Feedback = { message: string; tone: "success" | "error" } | null;

export function showAppToast(message: string, tone: "success" | "error" = "success") {
  window.dispatchEvent(new CustomEvent("dashboard:toast", { detail: { message, tone } }));
}

/**
 * Dashboard-wide toast for action results (saved, deleted, error, etc.),
 * bottom-right only. Clicked controls still dim briefly via
 * data-action-pending (see globals.css) while a route or server action
 * settles — that dim is the only per-click feedback; this component only
 * surfaces explicit success/error notices via showAppToast.
 */
const TOAST_DURATION_MS = 4000;

export function ActionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const clearTimer = useRef<number | null>(null);
  const remainingMs = useRef(TOAST_DURATION_MS);
  const timerStartedAt = useRef(0);
  const pendingControlTimers = useRef(new Map<HTMLElement, number>());
  const [feedback, setFeedback] = useState<Feedback>(null);

  const startClearTimer = useCallback((duration: number) => {
    if (clearTimer.current) window.clearTimeout(clearTimer.current);
    timerStartedAt.current = Date.now();
    remainingMs.current = duration;
    clearTimer.current = window.setTimeout(() => setFeedback(null), duration);
  }, []);

  const pauseClearTimer = useCallback(() => {
    if (clearTimer.current == null) return;
    window.clearTimeout(clearTimer.current);
    clearTimer.current = null;
    remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - timerStartedAt.current));
  }, []);

  const resumeClearTimer = useCallback(() => {
    if (clearTimer.current != null || remainingMs.current <= 0) return;
    startClearTimer(remainingMs.current);
  }, [startClearTimer]);

  const clearPendingControls = useCallback(() => {
    for (const [control, timer] of pendingControlTimers.current) {
      window.clearTimeout(timer);
      control.removeAttribute("data-action-pending");
    }
    pendingControlTimers.current.clear();
  }, []);

  const markControlPending = useCallback((control: Element, navigation = false) => {
    if (!(control instanceof HTMLElement)) return;
    const existing = pendingControlTimers.current.get(control);
    if (existing) window.clearTimeout(existing);
    control.setAttribute("data-action-pending", "true");
    const timer = window.setTimeout(() => {
      control.removeAttribute("data-action-pending");
      pendingControlTimers.current.delete(control);
    }, navigation ? 9000 : 1400);
    pendingControlTimers.current.set(control, timer);
  }, []);

  useEffect(() => {
    clearPendingControls();
  }, [pathname, searchParams, clearPendingControls]);

  useEffect(() => () => clearPendingControls(), [clearPendingControls]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const control = target?.closest("a[href],button,[role='button'],summary");
      if (!control || (control as HTMLButtonElement).disabled || control.getAttribute("aria-disabled") === "true") return;
      if (control.closest("[data-action-feedback-ignore]")) return;
      markControlPending(control, control.matches("a[href]"));
    };

    const onNavigationStart = (event: Event) => {
      const trigger = (event as CustomEvent<{ trigger?: Element }>).detail?.trigger;
      if (trigger) markControlPending(trigger, true);
    };
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; tone?: "success" | "error" }>).detail;
      if (!detail?.message) return;
      setFeedback({ message: detail.message, tone: detail.tone ?? "success" });
      startClearTimer(TOAST_DURATION_MS);
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("dashboard:navigation-start", onNavigationStart);
    window.addEventListener("dashboard:toast", onToast);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("dashboard:navigation-start", onNavigationStart);
      window.removeEventListener("dashboard:toast", onToast);
    };
  }, [markControlPending, startClearTimer]);

  if (!feedback) return null;
  return (
    <div
      role={feedback.tone === "error" ? "alert" : "status"}
      aria-live="polite"
      onMouseEnter={pauseClearTimer}
      onMouseLeave={resumeClearTimer}
      className={`fixed right-5 bottom-5 z-[120] flex w-[10cm] items-start gap-3 rounded-2xl border px-5 py-3.5 text-sm font-semibold shadow-2xl backdrop-blur-xl ${
        feedback.tone === "error"
          ? "border-red-300 bg-red-50/95 text-red-800 dark:border-red-800 dark:bg-red-950/95 dark:text-red-200"
          : "border-green-300 bg-green-50/95 text-green-800 dark:border-green-800 dark:bg-green-950/95 dark:text-green-200"
      }`}
    >
      <span aria-hidden="true" className={`mt-1 h-3 w-3 shrink-0 rounded-full ${feedback.tone === "error" ? "bg-red-600 dark:bg-red-400" : "bg-green-600 dark:bg-green-400"}`} />
      <span className="break-words">{feedback.message}</span>
    </div>
  );
}
