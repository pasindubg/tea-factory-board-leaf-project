import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";

/** Legacy deep links now land on the framework-owned user list. */
export default async function NewUserPage() {
  await requireProfile(["owner"]);
  redirect("/dashboard/users");
}
