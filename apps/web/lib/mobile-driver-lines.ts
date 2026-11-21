import "server-only";
import { friendlyError } from "@/lib/errors";
import type { requireMobileProfile } from "@/lib/neon/mobile-session";

type Caller = Exclude<Awaited<ReturnType<typeof requireMobileProfile>>, Response>;

/** null means the field officer's factory-wide registration access. An empty
 * array means a driver has no linked record/assignments and gets no lines. */
export async function mobileRegistrationLineIds({ profile, supabase }: Caller): Promise<string[] | null> {
  if (profile.role !== "driver") return null;
  const driver = await supabase.from("drivers").select("id")
    .eq("user_id", profile.id).eq("active", true).maybeSingle();
  if (driver.error) throw new Error(friendlyError(driver.error));
  if (!driver.data) return [];
  const assignments = await supabase.from("line_drivers").select("line_id").eq("driver_id", driver.data.id);
  if (assignments.error) throw new Error(friendlyError(assignments.error));
  return [...new Set((assignments.data ?? []).map((row) => String(row.line_id)))];
}
