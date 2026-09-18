import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { SessionProvider, useSession } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { colors } from "@/lib/theme";

// Field app: field officers, suppliers and drivers each get their own home
// group; everyone else is nudged to the web dashboard by the group layout.
function roleGroup(role?: string) {
  if (role === "driver") return "(driver)";
  if (role === "field_officer") return "(field)";
  return "(supplier)";
}

function roleHome(role?: string) {
  if (role === "driver") return "/(driver)/home";
  if (role === "field_officer") return "/(field)/lines";
  return "/(supplier)/home";
}

function AuthGate() {
  const { loading, session, profile, binding } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const group = segments[0]; // "(supplier)" | "(driver)" | "(field)" | "login" | undefined
    const inProtected = group === "(supplier)" || group === "(driver)" || group === "(field)";

    if (!session) {
      if (inProtected) router.replace("/login");
      return;
    }
    if (!profile) return; // wait until the role resolves before routing
    if (!binding) return; // and until this phone is cleared for the login

    if (binding !== "bound" && binding !== "claimed") {
      signOut();
      return;
    }
    if (group !== roleGroup(profile.role)) router.replace(roleHome(profile.role));
  }, [loading, session, profile, binding, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
        <AuthGate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
