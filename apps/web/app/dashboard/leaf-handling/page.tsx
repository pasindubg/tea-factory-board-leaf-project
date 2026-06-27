import { redirect } from "next/navigation";

// The Leaf Handling hub: clicking the sidebar section navigates here.
// Redirect to the first leaf-handling module page so the user lands on
// something useful immediately.
export default function LeafHandlingPage() {
  redirect("/dashboard/weighings");
}
