"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function startNavigationFeedback(trigger?: Element) {
  window.dispatchEvent(new CustomEvent("dashboard:navigation-start", { detail: { trigger } }));
}

/**
 * Starts an animated gradient as soon as a dashboard link is clicked and keeps
 * it visible through the route transition. Router-driven navigation can emit
 * the same event through `startNavigationFeedback`.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const wasNavigating = useRef(false);

  useEffect(() => {
    const onNavigationStart = () => {
      wasNavigating.current = true;
      setVisible(true);
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target || link.hasAttribute("download") || event.defaultPrevented) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin === window.location.origin && target.href !== window.location.href) onNavigationStart();
    };
    window.addEventListener("dashboard:navigation-start", onNavigationStart);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("dashboard:navigation-start", onNavigationStart);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  useEffect(() => {
    if (!wasNavigating.current) return;
    const timer = window.setTimeout(() => {
      wasNavigating.current = false;
      setVisible(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [pathname, searchParams]);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading next page"
      className="navigation-progress fixed inset-x-0 top-0 z-[130] h-1"
    />
  );
}
