import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "@/runtime/safe-area";
import type { FrameworkListController } from "@tea/ui/list-controller";
import { NativeEntityList } from "@/components/NativeEntityList";
import { useSession } from "@/lib/session";
import { readResource, runCommand } from "@/lib/api";
import { colors, s } from "@/lib/theme";
import type { SupplierMessage } from "@/lib/types";

export default function Messages() {
  const { profile, supplier } = useSession();
  const [busy, setBusy] = useState(false);

  const loadRows = useCallback(async () => {
    if (!profile || profile.role !== "supplier" || !supplier) return [];
    return (await readResource<{ rows: SupplierMessage[] }>("supplier.messages")).rows;
  }, [profile, supplier]);
  async function markAllRead(
    list: FrameworkListController<SupplierMessage>,
    unread: SupplierMessage[],
  ) {
    if (!profile || profile.role !== "supplier" || !supplier || unread.length === 0) return;
    setBusy(true);
    await list.runMutation(async () => {
      await runCommand({ action: "supplier.messages.read", ids: unread.map((row) => row.id) });
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
