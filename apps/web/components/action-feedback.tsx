"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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
 * bottom-right only. Clicked controls still dim briefly via
 * data-action-pending (see globals.css) while a route or server action
 * settles — that dim is the only per-click feedback; this component only
 * surfaces explicit success/error notices via showAppToast.
 */
const TOAST_DURATION_MS = 4000;

/**
 * How long the page may stay locked with no completion signal at all. Long
 * enough that real work — an import walking hundreds of rows — finishes inside
 * it, since the lock expiring early is exactly the bug it would reintroduce.
 * Escape lifts it by hand, so a genuinely stuck lock is not a dead end.
 */
const MAX_BLOCK_MS = 60000;

/**
 * True for controls that only rearrange what is already on screen — a
 * disclosure, a menu, a popover trigger. They start no work, so nothing would
 * ever arrive to lift the lock and it would sit there until its cap.
 */
function rearrangesUiOnly(control: Element) {
  return (
    control.tagName === "SUMMARY" ||
    control.hasAttribute("aria-expanded") ||
    control.hasAttribute("aria-haspopup")
  );
}

export function ActionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const clearTimer = useRef<number | null>(null);
  const remainingMs = useRef(TOAST_DURATION_MS);
  const timerStartedAt = useRef(0);
  const pendingControlTimers = useRef(new Map<HTMLElement, number>());
  const blockTimer = useRef<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [blocking, setBlocking] = useState(false);

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

  const stopBlocking = useCallback(() => {
    if (blockTimer.current) window.clearTimeout(blockTimer.current);
    blockTimer.current = null;
    setBlocking(false);
  }, []);

  const clearPendingControls = useCallback(() => {
    for (const [control, timer] of pendingControlTimers.current) {
      window.clearTimeout(timer);
      control.removeAttribute("data-action-pending");
    }
    pendingControlTimers.current.clear();
    stopBlocking();
  }, [stopBlocking]);

  const markControlPending = useCallback(
    (control: Element, navigation = false) => {
    if (!(control instanceof HTMLElement)) return;
    const existing = pendingControlTimers.current.get(control);
    if (existing) window.clearTimeout(existing);
    control.setAttribute("data-action-pending", "true");

    // Lock the page behind the click, so a second click cannot land on work
    // already in flight. Skipped for controls that only rearrange what is
    // already on screen — a disclosure, a menu — because there is nothing in
    // flight to wait for and the lock would have no end condition but its cap.
    if (!rearrangesUiOnly(control)) {
      setBlocking(true);
      if (blockTimer.current) window.clearTimeout(blockTimer.current);
      // Capped independently of, and far below, the dim's backstop. A stale dim
      // is cosmetic; a stale lock is the application appearing frozen, so it is
      // the one that has to give up early if no completion signal ever arrives.
      blockTimer.current = window.setTimeout(stopBlocking, MAX_BLOCK_MS);
    }

    // A backstop, not the ordinary way out. The dim is cleared for real by the
    // route changing or by a toast reporting the result; this only exists so a
    // click that settles silently — a modal opening, an action that neither
    // navigates nor reports — cannot leave a control dim forever.
    //
    // It used to be 9s / 1.4s, short enough that ordinary work outlived it. The
    // dim then cleared while the page was still loading, which reads as
    // "finished" when nothing had finished — worse than no feedback, because it
    // invites a second click on work already in flight.
    const timer = window.setTimeout(() => {
      control.removeAttribute("data-action-pending");
      pendingControlTimers.current.delete(control);
    }, navigation ? 30000 : 8000);
    pendingControlTimers.current.set(control, timer);
    },
    [stopBlocking],
  );

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
      const detail = (event as CustomEvent<{ message?: string; tone?: "success" | "error"; action?: ToastAction }>).detail;
      if (!detail?.message) return;
      setFeedback({ message: detail.message, tone: detail.tone ?? "success", action: detail.action });
      // A toast offering a follow-up gets longer to read and reach for.
      startClearTimer(detail.action ? TOAST_DURATION_MS * 3 : TOAST_DURATION_MS);
      // The action reported its result, so whatever was clicked to start it is
      // done. This is the completion signal for work that stays on the page —
      // a route change never comes, and without this the dim sat there until
      // the backstop expired.
      clearPendingControls();
    };

    // The way out when a click starts work that never reports back. Without it
    // the only remedy for a mislocked page is waiting out MAX_BLOCK_MS.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearPendingControls();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("dashboard:navigation-start", onNavigationStart);
    window.addEventListener("dashboard:toast", onToast);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("dashboard:navigation-start", onNavigationStart);
      window.removeEventListener("dashboard:toast", onToast);
    };
  }, [markControlPending, startClearTimer, clearPendingControls]);

  return (
    <>
      {/* Swallows every pointer event underneath it. Sits above the dialogs
          (z-150) it must also cover, and below the toast, which is raised to
          160 so the result of the very action being waited on stays readable
          and its follow-up link stays reachable. */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-[155] bg-stone-500/10 transition-opacity duration-200 ${
          blocking ? "cursor-progress opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {feedback && (
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
      )}
    </>
  );
}
