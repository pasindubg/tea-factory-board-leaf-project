import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useSession } from "@/lib/session";
import { colors, s } from "@/lib/theme";

export default function SupplierLayout() {
  const { profile } = useSession();

  // The field app is for suppliers and drivers. Anyone else (owner/manager/
  // collector) lands here by default and is pointed at the web dashboard.
  if (profile && profile.role !== "supplier") {
    return (
      <SafeAreaView style={[s.screen, { padding: 20, justifyContent: "center" }]}>
        <View style={s.card}>
          <Text style={s.h2}>Field app</Text>
          <Text style={[s.muted, { marginTop: 8 }]}>
            This app is for suppliers and drivers. Your account ({profile.name}) is a {profile.role} —
            please use the web dashboard.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerShadowVisible: false,
        headerTintColor: colors.green,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="home" options={{ headerShown: false }} />
      <Stack.Screen name="new-request" options={{ title: "New request", presentation: "modal" }} />
      <Stack.Screen name="requests" options={{ title: "My requests" }} />
      <Stack.Screen name="messages" options={{ title: "Messages" }} />
    </Stack>
  );
}
