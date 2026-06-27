import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import type { RequestType } from "@/lib/types";
import { colors, s } from "@/lib/theme";

// Supplier home. The request menu is rendered FROM the request_types table, so
// the factory can add a new request type (a DB row) without an app update —
// the server-driven-UI half of issue #13's "no reinstall" requirement.
export default function SupplierHome() {
  const { supplier, signOut } = useSession();
  const router = useRouter();
  const [types, setTypes] = useState<RequestType[]>([]);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("request_types")
        .select("id, key, label, fields, requires_amount, creates_advance, sort_order")
        .eq("active", true)
        .order("sort_order"),
      // unread direct messages (RLS already scopes to this supplier)
      supabase
        .from("supplier_messages")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .not("supplier_id", "is", null),
    ]);
    setTypes((data as RequestType[]) ?? []);
    setUnread(count ?? 0);
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

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
          <View style={{ flexShrink: 1 }}>
            <Text style={s.h1}>Hello{supplier ? `, ${supplier.name.split(" ")[0]}` : ""}</Text>
            <Text style={[s.muted, { marginTop: 2 }]}>What would you like to request?</Text>
          </View>
          <Pressable onPress={signOut} hitSlop={8}>
            <Text style={{ color: colors.green, fontSize: 14, fontWeight: "500" }}>Sign out</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 20, gap: 12 }}>
          {types.map((t) => (
            <Pressable
              key={t.id}
              style={[s.card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
              onPress={() => router.push(`/(supplier)/new-request?key=${encodeURIComponent(t.key)}`)}
            >
              <Text style={s.h2}>{t.label}</Text>
              <Text style={{ color: colors.faint, fontSize: 22 }}>›</Text>
            </Pressable>
          ))}
          {types.length === 0 && (
            <View style={s.card}>
              <Text style={s.muted}>No request types available yet — your factory will enable these soon.</Text>
            </View>
          )}
        </View>

        <Pressable
          style={[s.card, { marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center" }]}
          onPress={() => router.push("/(supplier)/messages")}
        >
          <Text style={{ color: colors.green, fontWeight: "600" }}>Messages</Text>
          {unread > 0 && (
            <View style={{ marginLeft: 8, backgroundColor: colors.green, borderRadius: 999, minWidth: 22, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{unread}</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          style={[s.card, { marginTop: 12, alignItems: "center" }]}
          onPress={() => router.push("/(supplier)/requests")}
        >
          <Text style={{ color: colors.green, fontWeight: "600" }}>My requests ›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
