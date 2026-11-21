import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "@/runtime/safe-area";
import { useRouter } from "@/runtime/navigation";
import { NativeEntityList } from "@/components/NativeEntityList";
import { useSession } from "@/lib/session";
import { colors, s } from "@/lib/theme";
import type { LineRow } from "@/lib/types";

export default function Lines() {
  const { profile, signOut } = useSession();
  const router = useRouter();
  return (
    <SafeAreaView style={s.screen} edges={["bottom"]}>
      <NativeEntityList<LineRow>
        resource={{ key: "field.lines" }}
        title="Pick a line"
        description={`Signed in as ${profile?.name ?? ""}. ${profile?.role === "driver" ? "Choose one of your assigned lines." : "Choose a line to register suppliers."}`}
        actions={(
          <View style={{ gap: 12 }}>
            {profile?.role === "driver" && (
              <Pressable accessibilityRole="button" onPress={() => router.replace("/(driver)/home")}>
                <Text style={{ color: colors.green }}>Driver home</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={signOut}><Text style={s.linkText}>Sign out</Text></Pressable>
          </View>
        )}
        keyExtractor={(line) => line.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        emptyMessage={profile?.role === "driver" ? "No active lines are assigned to your User ID. Ask the factory to link your driver record and assign a line." : "No active lines yet. The factory sets these up in the ERP."}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" style={s.card} onPress={() => router.push(`/(field)/line/${item.id}?lineNo=${encodeURIComponent(item.line_no)}`)}>
            <Text style={s.h2}>Line {item.line_no}{item.name ? ` · ${item.name}` : ""}</Text>
            <Text style={[s.muted, { marginTop: 4 }]}>{item.vehicles?.vehicle_no ? `Vehicle ${item.vehicles.vehicle_no}` : "No vehicle assigned"}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
