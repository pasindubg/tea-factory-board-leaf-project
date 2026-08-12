"use client";

import { ThemeProvider, useTheme } from "next-themes";

export function Providers({ children, forcedTheme }: { children: React.ReactNode; forcedTheme?: "light" | "dark" }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" forcedTheme={forcedTheme} enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}

/**
 * The app's theme, read from the one thing that actually decides it.
 *
 * This app stores the choice in the httpOnly `app-theme` cookie and applies it
 * server-side (see app/layout.tsx), handing it to next-themes as
 * `forcedTheme`. It never calls next-themes' `setTheme`, so next-themes'
 * OWN state is not the source of truth and must not be read directly:
 *
 *   `theme`         — the localStorage preference. Stale here; whatever value
 *                     it happens to hold survives every cookie change.
 *   `resolvedTheme` — computed as `theme === "system" ? systemTheme : theme`,
 *                     which ignores `forcedTheme` entirely (see next-themes
 *                     source). So it disagrees with the page whenever the
 *                     cookie and localStorage differ.
 *
 * `preference` is what the user picked ("system" when the cookie is absent);
 * `resolved` is the light/dark actually on screen, and is undefined until
 * mounted in system mode, because the system value cannot be known on the
 * server.
 */
export function useAppTheme(): {
  preference: "system" | "light" | "dark";
  resolved: "light" | "dark" | undefined;
} {
  const { forcedTheme, systemTheme } = useTheme();
  const preference = forcedTheme === "light" || forcedTheme === "dark" ? forcedTheme : "system";
  return { preference, resolved: preference === "system" ? systemTheme : preference };
}
