import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useSession } from "@/lib/session";
import { colors, s } from "@/lib/theme";

export default function DriverLayout() {
  const { profile } = useSession();

  if (profile && profile.role !== "driver") {
    return (
      <SafeAreaView style={[s.screen, { padding: 20, justifyContent: "center" }]}>
        <View style={s.card}>
          <Text style={s.h2}>Driver app</Text>
          <Text style={[s.muted, { marginTop: 8 }]}>
            This area is for route drivers. Your account ({profile.name}) is a {profile.role}.
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
    </Stack>
  );
}
