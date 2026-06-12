import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the signed-in user's profile (factory + role) for pages and
 * server actions. Redirects to login if unauthenticated or collector-role.
 */
export async function requireProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id, name, role, factory_id")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "collector") redirect("/login?error=collector_role");

  return { supabase, profile };
}
