import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";

// Entry route: bounce to the app or the login screen. The AuthGate in the root
// layout handles the live redirect; this covers the very first frame.
export default function Index() {
  const { session } = useSession();
  return <Redirect href={session ? "/(app)/home" : "/login"} />;
}
