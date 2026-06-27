import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import type { SupplierMessage } from "@/lib/types";
import { colors, s } from "@/lib/theme";

// Supplier inbox (FA3). RLS returns this supplier's direct messages + the
// factory's broadcasts. Read-state is tracked for direct messages only.
export default function Messages() {
  const { supplier } = useSession();
  const [rows, setRows] = useState<SupplierMessage[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("supplier_messages")
      .select("id, supplier_id, title, body, sent_at, read_at")
      .order("sent_at", { ascending: false });
    setRows((data as SupplierMessage[]) ?? []);
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const unread = rows.filter((m) => m.supplier_id != null && m.read_at == null);

  async function markAllRead() {
    if (!supplier || unread.length === 0) return;
    setBusy(true);
    await supabase
      .from("supplier_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("supplier_id", supplier.id)
      .is("read_at", null);
    setBusy(false);
    await load();
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={s.screen} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={s.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
      >
        {unread.length > 0 && (
          <Pressable style={[s.button, { marginBottom: 12 }, busy && s.buttonDisabled]} disabled={busy} onPress={markAllRead}>
            <Text style={s.buttonText}>Mark {unread.length} as read</Text>
          </Pressable>
        )}

        <View style={{ gap: 12 }}>
          {rows.map((m) => {
            const isUnread = m.supplier_id != null && m.read_at == null;
            const isBroadcast = m.supplier_id == null;
            return (
              <View key={m.id} style={[s.card, isUnread && { borderLeftColor: colors.green, borderLeftWidth: 3 }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[s.h2, { flexShrink: 1 }]}>{m.title}</Text>
                  {isUnread ? (
                    <View style={{ backgroundColor: "#dcfce7", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: "#166534", fontSize: 11, fontWeight: "700" }}>New</Text>
                    </View>
                  ) : isBroadcast ? (
                    <Text style={s.faint}>Broadcast</Text>
                  ) : null}
                </View>
                <Text style={{ marginTop: 6, color: colors.text, fontSize: 14 }}>{m.body}</Text>
                <Text style={[s.faint, { marginTop: 6 }]}>{new Date(m.sent_at).toLocaleDateString()}</Text>
              </View>
            );
          })}
          {rows.length === 0 && (
            <View style={s.card}>
              <Text style={s.muted}>No messages yet.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
