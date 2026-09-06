import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useSession } from "@/lib/session";
import { colors, s } from "@/lib/theme";

export default function FieldLayout() {
  const { profile } = useSession();

  if (profile && profile.role !== "field_officer") {
    return (
      <SafeAreaView style={[s.screen, { padding: 20, justifyContent: "center" }]}>
        <View style={s.card}>
          <Text style={s.h2}>Field registration</Text>
          <Text style={[s.muted, { marginTop: 8 }]}>
            These screens are for field officers. Your account ({profile.name}) is a {profile.role}.
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
      <Stack.Screen name="lines" options={{ title: "Lines" }} />
      <Stack.Screen name="line/[id]" options={{ title: "Customers" }} />
      <Stack.Screen name="line/[id]/new" options={{ title: "New customer", presentation: "modal" }} />
    </Stack>
  );
}
