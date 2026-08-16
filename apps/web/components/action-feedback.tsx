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
 * Whether a click is starting work the page should be held for.
 *
 * This used to ask the opposite question — lock everything, then exempt the
 * controls guessed to be harmless — and the guessing could not be made to
 * work. A dashboard is mostly buttons that rearrange the screen: opening a new
 * row, a search panel, a dialog, and the Cancel and Close inside it. Each one
 * locked the page against work that was never started, and with the expiry
 * timers gone there was nothing to end a lock nothing would ever report on.
 *
 * So only three things qualify, each with a release that actually arrives:
 *
 *   a link          — the route change that follows lifts it
 *   a form submit   — the submission navigates, reports, or ends its busy state
 *   data-action-lock — opt in for work driven by onClick instead of a form
 *
 * Everything else is left alone, which is why Cancel, Close and the popover
 * triggers need no exemption: they were never candidates to begin with.
 *
 * This decides the DIM only. Whether the page is also sealed is a separate and
 * much narrower question — see locksPage().
 */
/**
 * Whether a click should also seal the page behind it.
 *
 * Kept much narrower than the dim, because the two answer different questions
 * and merging them was the mistake. A dim left on the wrong control is
 * cosmetic; a lock left on the wrong click makes the application unusable, and
 * every form that reported its result on the page instead of navigating did
 * exactly that — delete, import, save.
 *
 * So a lock is only for a navigation, where the arriving route is a release
 * that cannot fail to come, or where a caller has explicitly asked for one.
 * A long import is the clearest case AGAINST locking: the whole point of
 * running it in the background is being able to walk away from it.
 */
function locksPage(control: Element) {
  return control.hasAttribute("data-action-lock") || control instanceof HTMLAnchorElement;
}

/** A held control, and whether it has been seen in its own busy state yet. */
type PendingControl = { observer: MutationObserver; sawBusy: boolean };

/** The two ways this codebase says "this control's action is running". */
function isBusy(control: HTMLElement) {
  return (
    (control as HTMLButtonElement | HTMLInputElement).disabled === true ||
    control.getAttribute("aria-busy") === "true"
  );
}

function startsWork(control: Element) {
  if (control.hasAttribute("data-action-lock")) return true;

  if (control instanceof HTMLAnchorElement) {
    if (control.target || control.hasAttribute("download")) return false;
    const target = new URL(control.href, window.location.href);
    return target.origin === window.location.origin && target.href !== window.location.href;
  }

  // `.type` is "submit" by default even outside a form, so the owning form is
  // what separates a real submission from an ordinary button.
  if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
    return control.type === "submit" && control.form !== null;
  }

  return false;
}

export function ActionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const clearTimer = useRef<number | null>(null);
  const remainingMs = useRef(TOAST_DURATION_MS);
  const timerStartedAt = useRef(0);
  const pendingControls = useRef(new Map<HTMLElement, PendingControl>());
  const lastRoute = useRef<string | null>(null);
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

  const clearPendingControls = useCallback(() => {
    for (const [control, entry] of pendingControls.current) {
      entry.observer.disconnect();
      control.removeAttribute("data-action-pending");
    }
    pendingControls.current.clear();
    setBlocking(false);
  }, []);

  const releaseControl = useCallback((control: HTMLElement) => {
    const entry = pendingControls.current.get(control);
    if (!entry) return;
    entry.observer.disconnect();
    control.removeAttribute("data-action-pending");
    pendingControls.current.delete(control);
    if (pendingControls.current.size === 0) setBlocking(false);
  }, []);

  // No timers. Earlier versions expired the dim after a fixed number of
  // milliseconds, and every value chosen was wrong: whatever the number, work
  // that ran longer left the control bright and the page unlocked while it was
  // still going, which reads as finished when it is not. The dim now ends only
  // when the work does — a route change, a toast carrying the result, the
  // control's own busy state ending, or Escape.
  const markControlPending = useCallback(
    (control: Element, force = false) => {
      if (!(control instanceof HTMLElement)) return;
      if (!force && !startsWork(control)) return;
      if (pendingControls.current.has(control)) return;
      control.setAttribute("data-action-pending", "true");
      if (force || locksPage(control)) setBlocking(true);

      // The third release signal, and the one that covers the awkward case: a
      // form whose action reports its result on the page never changes route
      // and need not toast, so neither of the other two ever arrives. What it
      // does do is disable its own control while the action runs — AppButton
      // sets `disabled` and `aria-busy` from useFormStatus, and the hand-rolled
      // forms pass `disabled={pending}` — so the return to enabled IS the work
      // finishing. Observed, not timed.
      //
      // `sawBusy` is what stops a control that was never busy from releasing on
      // an unrelated attribute change.
      const observer = new MutationObserver(() => {
        const entry = pendingControls.current.get(control);
        if (!entry) return;
        if (isBusy(control)) {
          entry.sawBusy = true;
          return;
        }
        if (entry.sawBusy) releaseControl(control);
      });
      observer.observe(control, { attributes: true, attributeFilter: ["disabled", "aria-busy"] });
      pendingControls.current.set(control, { observer, sawBusy: isBusy(control) });
    },
    [releaseControl],
  );

  // Only an actual change of route clears anything. This compared the effect's
  // dependencies before, which fires again on any re-render that hands back a
  // new searchParams object — a server action revalidating in place does
  // exactly that, so the dim was being cleared by the work's own progress.
  useEffect(() => {
    const route = `${pathname}?${searchParams}`;
    if (lastRoute.current !== null && lastRoute.current !== route) clearPendingControls();
    lastRoute.current = route;
  }, [pathname, searchParams, clearPendingControls]);

  useEffect(() => () => clearPendingControls(), [clearPendingControls]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const control = target?.closest("a[href],button,[role='button'],summary");
      if (!control || (control as HTMLButtonElement).disabled || control.getAttribute("aria-disabled") === "true") return;
      if (control.closest("[data-action-feedback-ignore]")) return;
      markControlPending(control);
    };

    // Fired by code that is about to navigate, so the trigger is held whatever
    // it is — often an ordinary button that startsWork() would decline.
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

    // The way out when a click starts work that never reports back. With no
    // timer left to expire, this is the only thing that can release such a
    // click, so it is load-bearing rather than a convenience.
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
        className={`action-lock-cover fixed inset-0 z-[155] transition-opacity duration-200 ${
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
