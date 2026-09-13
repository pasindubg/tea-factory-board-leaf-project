import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { colors, s } from "@/lib/theme";
import type { LineRow } from "@/lib/types";

export default function Lines() {
  const { profile, signOut } = useSession();
  const router = useRouter();
  const [lines, setLines] = useState<LineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data, error: readError } = await supabase
      .from("lines")
      .select("id, line_no, name, vehicles(vehicle_no)")
      .eq("factory_id", profile.factory_id)
      .eq("active", true)
      .order("line_no");
    if (readError) setError(readError.message);
    else {
      setError(null);
      setLines((data ?? []) as unknown as LineRow[]);
    }
    setLoading(false);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <SafeAreaView style={[s.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.green} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={["bottom"]}>
      <FlatList
        data={lines}
        keyExtractor={(line) => line.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.green} />}
        ListHeaderComponent={
          <View style={{ marginBottom: 6 }}>
            <Text style={s.h1}>Pick a line</Text>
            <Text style={[s.muted, { marginTop: 4 }]}>
              Signed in as {profile?.name}. Choose the line you are working today.
            </Text>
            {error && (
              <View style={[s.errorBox, { marginTop: 12 }]}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={s.card}>
            <Text style={s.muted}>No active lines yet. The factory sets these up on the web.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => router.push(`/(field)/line/${item.id}`)}>
            <Text style={s.h2}>
              Line {item.line_no}
              {item.name ? ` · ${item.name}` : ""}
            </Text>
            <Text style={[s.muted, { marginTop: 4 }]}>
              {item.vehicles?.vehicle_no ? `Vehicle ${item.vehicles.vehicle_no}` : "No vehicle assigned"}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          <Pressable onPress={signOut} style={{ marginTop: 20 }}>
            <Text style={s.linkText}>Sign out</Text>
          </Pressable>
        }
      />
    </SafeAreaView>
  );
}
