import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { SessionProvider, useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

// Field app: suppliers and drivers get different home groups; everyone else is
// nudged to the web dashboard by the group layout's role guard.
function roleHome(role?: string) {
  return role === "driver" ? "/(driver)/home" : "/(supplier)/home";
}

function AuthGate() {
  const { loading, session, profile } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const group = segments[0]; // "(supplier)" | "(driver)" | "login" | undefined
    const inProtected = group === "(supplier)" || group === "(driver)";

    if (!session) {
      if (inProtected) router.replace("/login");
      return;
    }
    if (!profile) return; // wait until the role resolves before routing

    const targetGroup = profile.role === "driver" ? "(driver)" : "(supplier)";
    if (group !== targetGroup) router.replace(roleHome(profile.role));
  }, [loading, session, profile, segments, router]);

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
