import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";

// Entry route: bounce to the role's home or login. The AuthGate in the root
// layout handles live redirects; this covers the very first frame.
export default function Index() {
  const { session, profile } = useSession();
  if (!session) return <Redirect href="/login" />;
  if (profile?.role === "driver") return <Redirect href="/(driver)/home" />;
  if (profile?.role === "field_officer") return <Redirect href="/(field)/lines" />;
  return <Redirect href="/(supplier)/home" />;
}
