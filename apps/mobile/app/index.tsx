import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";

// Entry route: bounce to the role's home or login. The AuthGate in the root
// layout handles live redirects; this covers the very first frame.
export default function Index() {
  const { session, profile } = useSession();
  if (!session) return <Redirect href="/login" />;
  return <Redirect href={profile?.role === "driver" ? "/(driver)/home" : "/(supplier)/home"} />;
}
