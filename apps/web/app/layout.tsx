import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tea Factory Ops",
  description: "Green leaf intake, suppliers and payments for bought-leaf tea factories",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
