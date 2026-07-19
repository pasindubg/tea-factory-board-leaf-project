import { redirect } from "next/navigation";

/** Weighing creation is owned by the framework list's built-in New action. */
export default function LegacyNewWeighingPage() {
  redirect("/dashboard/weighings");
}
