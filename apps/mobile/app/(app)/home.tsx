import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { todayRange } from "@/lib/dates";
import { colors, s } from "@/lib/theme";

export default function Home() {
  const { profile, collector, signOut } = useSession();
  const router = useRouter();
  const [totalKg, setTotalKg] = useState(0);
  const [count, setCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile || profile.role !== "collector" || !collector) return;
    setError(null);
    const { start, end } = todayRange();
    const { data, error: loadError } = await supabase
      .from("weighings")
      .select("weight_kg")
      .eq("factory_id", profile.factory_id)
      .eq("collector_id", collector.id)
      .gte("collected_at", start)
      .lt("collected_at", end);
    if (loadError) {
      setError(loadError.message);
      return;
    }
    const rows = data ?? [];
    setCount(rows.length);
    setTotalKg(rows.reduce((sum, r) => sum + Number(r.weight_kg), 0));
  }, [collector, profile]);

  // Reload whenever the tab regains focus (e.g. after recording a weighing).
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

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={s.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Text style={s.h1}>Good day{collector ? `, ${collector.name.split(" ")[0]}` : ""}</Text>
            <Text style={[s.muted, { marginTop: 2 }]}>
              {new Date().toLocaleDateString([], { dateStyle: "full" })}
            </Text>
          </View>
          <Pressable onPress={signOut} hitSlop={8}>
            <Text style={{ color: colors.green, fontSize: 14, fontWeight: "500" }}>Sign out</Text>
          </Pressable>
        </View>

        {error && (
          <View style={[s.errorBox, { marginTop: 16 }]} accessibilityRole="alert">
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
          <View style={[s.card, { flex: 1 }]}>
            <Text style={s.muted}>Today&apos;s intake</Text>
            <Text style={{ fontSize: 26, fontWeight: "700", color: colors.text, marginTop: 6 }}>
              {totalKg.toFixed(2)} <Text style={s.faint}>kg</Text>
            </Text>
          </View>
          <View style={[s.card, { flex: 1 }]}>
            <Text style={s.muted}>Weighings</Text>
            <Text style={{ fontSize: 26, fontWeight: "700", color: colors.text, marginTop: 6 }}>{count}</Text>
          </View>
        </View>

        <Pressable style={[s.button, { marginTop: 20, paddingVertical: 16 }]} onPress={() => router.push("/(app)/weigh")}>
          <Text style={[s.buttonText, { fontSize: 16 }]}>Record a weighing</Text>
        </Pressable>

        <Text style={[s.faint, { marginTop: 24, textAlign: "center" }]}>
          {profile?.name} · {collector?.area ?? "—"}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
