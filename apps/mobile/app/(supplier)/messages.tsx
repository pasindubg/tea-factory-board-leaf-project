import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { FrameworkListController } from "@tea/ui/list-controller";
import { NativeEntityList } from "@/components/NativeEntityList";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors, s } from "@/lib/theme";
import type { SupplierMessage } from "@/lib/types";

export default function Messages() {
  const { profile, supplier } = useSession();
  const [busy, setBusy] = useState(false);

  const loadRows = useCallback(async () => {
    if (!profile || profile.role !== "supplier" || !supplier) return [];
    const { data, error } = await supabase
      .from("supplier_messages")
      .select("id, supplier_id, title, body, sent_at, read_at")
      .eq("factory_id", profile.factory_id)
      .or(`supplier_id.is.null,supplier_id.eq.${supplier.id}`)
      .order("sent_at", { ascending: false });
    if (error) throw error;
    return (data as SupplierMessage[]) ?? [];
  }, [profile, supplier]);
  async function markAllRead(
    list: FrameworkListController<SupplierMessage>,
    unread: SupplierMessage[],
  ) {
    if (!profile || profile.role !== "supplier" || !supplier || unread.length === 0) return;
    setBusy(true);
    await list.runMutation(async () => {
      const { data, error } = await supabase
        .from("supplier_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("factory_id", profile.factory_id)
        .eq("supplier_id", supplier.id)
        .is("read_at", null)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Those messages were already updated. Pull down to refresh the inbox.");
    });
    setBusy(false);
  }

  return (
    <SafeAreaView style={s.screen} edges={["bottom"]}>
      <NativeEntityList
        loadRows={loadRows}
        title="Inbox"
        description="Direct factory messages and factory-wide broadcasts."
        actions={(list) => {
          const unread = list.rows.filter((message) => message.supplier_id != null && message.read_at == null);
          return unread.length > 0 ? (
            <Pressable
              style={[s.button, { paddingHorizontal: 12, paddingVertical: 9 }, busy && s.buttonDisabled]}
              disabled={busy}
              onPress={() => { void markAllRead(list, unread); }}
            >
              <Text style={s.buttonText}>Mark {unread.length} read</Text>
            </Pressable>
          ) : null;
        }}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.pad}
        emptyMessage="No messages yet."
        renderItem={({ item }) => {
          const isUnread = item.supplier_id != null && item.read_at == null;
          const isBroadcast = item.supplier_id == null;
          return (
            <View style={[s.card, { marginBottom: 12 }, isUnread && { borderLeftColor: colors.green, borderLeftWidth: 3 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[s.h2, { flexShrink: 1 }]}>{item.title}</Text>
                {isUnread ? (
                  <View style={{ backgroundColor: "#dcfce7", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: "#166534", fontSize: 11, fontWeight: "700" }}>New</Text>
                  </View>
                ) : isBroadcast ? (
                  <Text style={s.faint}>Broadcast</Text>
                ) : null}
              </View>
              <Text style={{ marginTop: 6, color: colors.text, fontSize: 14 }}>{item.body}</Text>
              <Text style={[s.faint, { marginTop: 6 }]}>{new Date(item.sent_at).toLocaleDateString()}</Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
