import { Text, View, type ColorValue } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import { useSession } from "@/lib/session";
import { colors, s } from "@/lib/theme";

function TabIcon({ icon, color }: { icon: string; color: ColorValue }) {
  return <Text style={{ fontSize: 18, color }}>{icon}</Text>;
}

export default function AppLayout() {
  const { profile, collector } = useSession();

  // The app records weighings under a collector_id. A signed-in user with no
  // collector row (e.g. an owner) can't collect — send them back with a note.
  if (profile && !collector) {
    return (
      <SafeAreaView style={[s.screen, { padding: 20, justifyContent: "center" }]}>
        <View style={s.card}>
          <Text style={s.h2}>This app is for collectors</Text>
          <Text style={[s.muted, { marginTop: 8 }]}>
            Your account ({profile.name}) isn&apos;t set up as a collector. Ask your factory owner to
            add you as a collector, then sign in again. Owners and managers use the web dashboard.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: "Home", tabBarIcon: ({ color }) => <TabIcon icon="🏠" color={color} /> }}
      />
      <Tabs.Screen
        name="weigh"
        options={{ title: "Weigh", tabBarIcon: ({ color }) => <TabIcon icon="⚖️" color={color} /> }}
      />
      <Tabs.Screen
        name="records"
        options={{ title: "Today", tabBarIcon: ({ color }) => <TabIcon icon="📋" color={color} /> }}
      />
    </Tabs>
  );
}
