"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/** An optional follow-up the toast offers — "go and look at the thing this
 * just started". Kept to a single link so the toast stays a notice, not a
 * dialog. */
export type ToastAction = { label: string; href: string };

type Feedback = { message: string; tone: "success" | "error"; action?: ToastAction } | null;

export function showAppToast(
  message: string,
  tone: "success" | "error" = "success",
  action?: ToastAction,
) {
  window.dispatchEvent(new CustomEvent("dashboard:toast", { detail: { message, tone, action } }));
}

/**
 * Dashboard-wide toast for action results (saved, deleted, error, etc.),
 * bottom-right only. Click and navigation feedback is NavigationProgress.
 */
const TOAST_DURATION_MS = 4000;

export function ActionFeedback() {
  const clearTimer = useRef<number | null>(null);
  const remainingMs = useRef(TOAST_DURATION_MS);
  const timerStartedAt = useRef(0);
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

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; tone?: "success" | "error"; action?: ToastAction }>).detail;
      if (!detail?.message) return;
      setFeedback({ message: detail.message, tone: detail.tone ?? "success", action: detail.action });
      // A toast offering a follow-up gets longer to read and reach for.
      startClearTimer(detail.action ? TOAST_DURATION_MS * 3 : TOAST_DURATION_MS);
    };

    window.addEventListener("dashboard:toast", onToast);
    return () => window.removeEventListener("dashboard:toast", onToast);
  }, [startClearTimer]);

  if (!feedback) return null;

  return (
    <div
      role={feedback.tone === "error" ? "alert" : "status"}
      aria-live="polite"
      onMouseEnter={pauseClearTimer}
      onMouseLeave={resumeClearTimer}
      className={`fixed right-5 bottom-5 z-[160] flex w-[10cm] items-start gap-3 rounded-2xl border px-5 py-3.5 text-sm font-semibold shadow-2xl backdrop-blur-xl ${
        feedback.tone === "error"
          ? "border-red-300 bg-red-50/95 text-red-800 dark:border-red-800 dark:bg-red-950/95 dark:text-red-200"
          : "border-green-300 bg-green-50/95 text-green-800 dark:border-green-800 dark:bg-green-950/95 dark:text-green-200"
      }`}
    >
      <span aria-hidden="true" className={`mt-1 h-3 w-3 shrink-0 rounded-full ${feedback.tone === "error" ? "bg-red-600 dark:bg-red-400" : "bg-green-600 dark:bg-green-400"}`} />
      <span className="min-w-0 grow break-words">
        {feedback.message}
        {feedback.action && (
          <Link
            href={feedback.action.href}
            onClick={() => setFeedback(null)}
            className="mt-2 block w-fit rounded-full border border-current px-3 py-1 text-xs font-semibold hover:opacity-80"
          >
            {feedback.action.label}
          </Link>
        )}
      </span>
    </div>
  );
}
