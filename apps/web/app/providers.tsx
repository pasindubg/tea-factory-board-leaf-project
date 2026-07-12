"use client";

import { ThemeProvider } from "next-themes";

export function Providers({ children, forcedTheme }: { children: React.ReactNode; forcedTheme?: "light" | "dark" }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" forcedTheme={forcedTheme} enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
