import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { NativeEntityList } from "@/components/NativeEntityList";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors, s } from "@/lib/theme";
import type { RequestType } from "@/lib/types";

// Request types remain server-driven: new factory configuration appears after
// a component-local refresh without an app release or route reload.
export default function SupplierHome() {
  const { profile, supplier, signOut } = useSession();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  const loadRows = useCallback(async () => {
    if (!profile || profile.role !== "supplier" || !supplier) return [];
    const [typesResult, messagesResult] = await Promise.all([
      supabase
        .from("request_types")
        .select("id, key, label, fields, requires_amount, creates_advance, sort_order")
        .eq("factory_id", profile.factory_id)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("supplier_messages")
        .select("id", { count: "exact", head: true })
        .eq("factory_id", profile.factory_id)
        .eq("supplier_id", supplier.id)
        .is("read_at", null),
    ]);
    if (typesResult.error) throw typesResult.error;
    if (messagesResult.error) throw messagesResult.error;

    setUnread(messagesResult.count ?? 0);
    return (typesResult.data as RequestType[]) ?? [];
  }, [profile, supplier]);
  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <NativeEntityList
        loadRows={loadRows}
        title={`Hello${supplier ? `, ${supplier.name.split(" ")[0]}` : ""}`}
        description="What would you like to request?"
        actions={(
          <Pressable onPress={signOut} hitSlop={8}>
            <Text style={{ color: colors.green, fontSize: 14, fontWeight: "500" }}>Sign out</Text>
          </Pressable>
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.pad}
        emptyMessage="No request types available yet — your factory will enable these soon."
        footer={(
          <View style={{ marginTop: 12 }}>
            <Pressable
              style={[s.card, { flexDirection: "row", alignItems: "center", justifyContent: "center" }]}
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
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            style={[s.card, { marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
            onPress={() => router.push(`/(supplier)/new-request?key=${encodeURIComponent(item.key)}`)}
          >
            <Text style={s.h2}>{item.label}</Text>
            <Text style={{ color: colors.faint, fontSize: 22 }}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
