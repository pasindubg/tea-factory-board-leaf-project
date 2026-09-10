import { redirect } from "next/navigation";

/**
 * The section root, which had no route at all: `/dashboard/auction` returned a
 * raw Next.js 404 page — no sidebar, no way back — so a typed URL, an old
 * bookmark or a trimmed link dead-ended outside the app entirely.
 *
 * It has no content of its own; the section's landing page is the dashboard.
 */
export default function AuctionSectionIndex() {
  redirect("/dashboard/auction/dashboard");
}
