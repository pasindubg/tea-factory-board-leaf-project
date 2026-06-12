import { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { formatTime, todayRange } from "@/lib/dates";
import type { Weighing } from "@/lib/types";
import { colors, s } from "@/lib/theme";

export default function Records() {
  const { collector } = useSession();
  const [rows, setRows] = useState<Weighing[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!collector) return;
    const { start, end } = todayRange();
    const { data } = await supabase
      .from("weighings")
      .select("id, weight_kg, collected_at, suppliers(name)")
      .eq("collector_id", collector.id)
      .gte("collected_at", start)
      .lt("collected_at", end)
      .order("collected_at", { ascending: false });
    setRows((data as unknown as Weighing[]) ?? []);
  }, [collector]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const total = rows.reduce((sum, r) => sum + Number(r.weight_kg), 0);

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <View style={s.pad}>
        <Text style={s.h1}>Today&apos;s records</Text>
        <Text style={[s.muted, { marginTop: 2 }]}>
          {rows.length} weighing{rows.length === 1 ? "" : "s"} · {total.toFixed(2)} kg total
        </Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
        ListEmptyComponent={
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={s.faint}>No weighings recorded today yet.</Text>
          </View>
        }
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
