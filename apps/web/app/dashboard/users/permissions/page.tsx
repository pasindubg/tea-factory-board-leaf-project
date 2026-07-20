import { redirect } from "next/navigation";

export default async function PermissionsPage() {
  redirect("/dashboard/user-handling/roles");
}
