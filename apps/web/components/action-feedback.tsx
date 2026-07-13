"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Feedback = { message: string; kind: "navigation" | "working" | "ready" | "success" | "error" } | null;

export function showAppToast(message: string, tone: "success" | "error" = "success") {
  window.dispatchEvent(new CustomEvent("dashboard:toast", { detail: { message, tone } }));
}

function controlLabel(element: Element) {
  const labelled = element.getAttribute("aria-label") || element.getAttribute("title");
  if (labelled) return labelled.replace(/\s+/g, " ").trim();
  const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > 42 ? `${text.slice(0, 39)}…` : text;
}

/**
 * Dashboard-wide acknowledgement for actions that otherwise have no visible
 * response while a route, server action, drawer, or setting is settling.
 * It intentionally listens at the shell boundary so new screens inherit the
 * behavior without importing a page-specific toast component.
 */
export function ActionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousRoute = useRef(`${pathname}?${searchParams.toString()}`);
  const clearTimer = useRef<number | null>(null);
  const pendingControlTimers = useRef(new Map<HTMLElement, number>());
  const [feedback, setFeedback] = useState<Feedback>(null);

  const show = useCallback((message: string, kind: "navigation" | "working" | "ready" | "success" | "error" = "working") => {
    if (clearTimer.current) window.clearTimeout(clearTimer.current);
    setFeedback({ message, kind });
    clearTimer.current = window.setTimeout(() => setFeedback(null), kind === "navigation" ? 9000 : kind === "working" ? 7000 : 4200);
  }, []);

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
    const route = `${pathname}?${searchParams.toString()}`;
    if (route !== previousRoute.current) {
      previousRoute.current = route;
      clearPendingControls();
      show("Page ready", "ready");
    }
  }, [pathname, searchParams, show, clearPendingControls]);

  useEffect(() => () => clearPendingControls(), [clearPendingControls]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const control = target?.closest("a[href],button,[role='button'],summary");
      if (!control || (control as HTMLButtonElement).disabled || control.getAttribute("aria-disabled") === "true") return;
      if (control.closest("[data-action-feedback-ignore]")) return;

      const label = controlLabel(control) || "action";
      const isNavigation = control.matches("a[href]");
      markControlPending(control, isNavigation);
      if (isNavigation) show(`Navigating to ${label}…`, "navigation");
      else if (control.matches("summary")) show(`${label} ${control.parentElement?.hasAttribute("open") ? "closed" : "opened"}`);
      else if (control.hasAttribute("popoverTarget") || control.hasAttribute("popovertarget")) {
        const action = control.getAttribute("popovertargetaction") || control.getAttribute("popoverTargetAction");
        show(`${action === "hide" ? "Closing" : "Opening"} ${label}…`);
      }
      else if ((control as HTMLButtonElement).type === "submit" || control.closest("form")) show("Working…");
      else show(`${label} selected`);
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.hasAttribute("data-action-feedback-ignore")) return;
      show("Working…");
    };

    const onChange = (event: Event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement | null;
      if (!target || target.closest("[data-action-feedback-ignore]")) return;
      if (target.matches("select, input[type='checkbox'], input[type='radio']")) show("Updating…");
    };

    const onNavigationStart = (event: Event) => {
      const trigger = (event as CustomEvent<{ trigger?: Element }>).detail?.trigger;
      if (trigger) markControlPending(trigger, true);
    };
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; tone?: "success" | "error" }>).detail;
      if (detail?.message) show(detail.message, detail.tone ?? "success");
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("change", onChange, true);
    window.addEventListener("dashboard:navigation-start", onNavigationStart);
    window.addEventListener("dashboard:toast", onToast);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("change", onChange, true);
      window.removeEventListener("dashboard:navigation-start", onNavigationStart);
      window.removeEventListener("dashboard:toast", onToast);
    };
  }, [show, markControlPending]);

  if (!feedback) return null;
  return (
    <div
      role={feedback.kind === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`fixed right-5 ${feedback.kind === "success" || feedback.kind === "error" ? "bottom-5" : "top-5"} z-[120] inline-flex min-w-[18rem] items-center justify-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-semibold shadow-2xl backdrop-blur-xl ${
        feedback.kind === "navigation"
          ? "border-green-500 bg-green-800/95 text-white dark:border-green-400 dark:bg-green-500/95 dark:text-green-950"
          : feedback.kind === "working"
            ? "border-green-200 bg-white/95 text-stone-800 dark:border-green-800 dark:bg-stone-900/95 dark:text-stone-100"
            : feedback.kind === "error"
              ? "border-red-300 bg-red-50/95 text-red-800 dark:border-red-800 dark:bg-red-950/95 dark:text-red-200"
              : "border-green-300 bg-green-50/95 text-green-800 dark:border-green-800 dark:bg-green-950/95 dark:text-green-200"
      }`}
    >
      <span aria-hidden="true" className={`h-3 w-3 rounded-full ${feedback.kind === "navigation" ? "animate-pulse bg-white dark:bg-green-950" : feedback.kind === "working" ? "animate-pulse bg-amber-500" : feedback.kind === "error" ? "bg-red-600 dark:bg-red-400" : "bg-green-600 dark:bg-green-400"}`} />
      {feedback.message}
    </div>
  );
}
