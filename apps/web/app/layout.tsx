import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Tea Factory Ops",
  description: "Green leaf intake, suppliers and payments for bought-leaf tea factories",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 antialiased transition-colors">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
