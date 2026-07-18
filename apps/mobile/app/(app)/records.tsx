import { useCallback } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { NativeEntityList } from "@/components/NativeEntityList";
import { formatTime, todayRange } from "@/lib/dates";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors, s } from "@/lib/theme";
import type { Weighing } from "@/lib/types";

export default function Records() {
  const { profile, collector } = useSession();
  const router = useRouter();
  const loadRows = useCallback(async () => {
    if (!profile || profile.role !== "collector" || !collector) return [];
    const { start, end } = todayRange();
    const { data, error } = await supabase
      .from("weighings")
      .select("id, weight_kg, collected_at, suppliers(name)")
      .eq("factory_id", profile.factory_id)
      .eq("collector_id", collector.id)
      .gte("collected_at", start)
      .lt("collected_at", end)
      .order("collected_at", { ascending: false });
    if (error) throw error;
    return (data as unknown as Weighing[]) ?? [];
  }, [collector, profile]);
  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <NativeEntityList
        loadRows={loadRows}
        title="Today's records"
        description={(list) => {
          const total = list.rows.reduce((sum, row) => sum + Number(row.weight_kg), 0);
          return `${list.rows.length} weighing${list.rows.length === 1 ? "" : "s"} · ${total.toFixed(2)} kg total`;
        }}
        onCreate={() => router.push("/(app)/weigh")}
        canCreate={Boolean(profile?.role === "collector" && collector)}
        createDisabledReason="Your collector profile must be loaded before recording a weighing."
        createLabel="New weighing"
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        emptyMessage="No weighings recorded today yet."
        renderItem={({ item }) => (
          <View
            style={[
              s.card,
              { marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
            ]}
          >
            <View>
              <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>
                {item.suppliers?.name ?? "—"}
              </Text>
              <Text style={[s.faint, { marginTop: 2 }]}>{formatTime(item.collected_at)}</Text>
            </View>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>
              {Number(item.weight_kg).toFixed(2)} kg
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
