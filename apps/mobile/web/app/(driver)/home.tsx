import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "@/runtime/safe-area";
import type { FrameworkListController } from "@tea/ui/list-controller";
import { NativeEntityList } from "@/components/NativeEntityList";
import { useSession } from "@/lib/session";
import { readResource, runCommand } from "@/lib/api";
import { colors, s } from "@/lib/theme";
import type { SupplierRequest } from "@/lib/types";
import { useRouter } from "@/runtime/navigation";

// Driver route view: approved cash/items for this factory. Every query carries
// the authenticated profile's factory boundary in addition to RLS.
export default function DriverHome() {
  const { profile, signOut } = useSession();
  const router = useRouter();
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!profile || profile.role !== "driver") return [];
    const data = await readResource<{ rows: SupplierRequest[]; labels: Record<string, string> }>("driver.handovers");
    setLabels(new Map(Object.entries(data.labels)));
    return data.rows;
  }, [profile]);
  async function markHanded(id: string, list: FrameworkListController<SupplierRequest>) {
    if (!profile || profile.role !== "driver") return;
    setBusyId(id);
    await list.runMutation(async () => {
      await runCommand({ action: "driver.handover", id });
    });
    setBusyId(null);
  }

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <NativeEntityList
        loadRows={loadRows}
        title="Today's route"
        description="Money and items to hand over"
        actions={(
          <View style={{ gap: 12, alignItems: "flex-end" }}>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(field)/lines")} style={[s.button, { paddingHorizontal: 12 }]}>
              <Text style={s.buttonText}>Register suppliers</Text>
            </Pressable>
            <Pressable onPress={signOut} hitSlop={8}>
              <Text style={{ color: colors.green, fontSize: 14, fontWeight: "500" }}>Sign out</Text>
            </Pressable>
          </View>
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.pad}
        emptyMessage="Nothing to hand over right now."
        renderItem={({ item }, list) => (
          <View style={[s.card, { marginBottom: 12 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={s.h2}>{item.suppliers?.name ?? "Supplier"}</Text>
              {item.amount != null && (
                <Text style={{ fontWeight: "700", color: colors.text }}>LKR {Number(item.amount).toLocaleString()}</Text>
              )}
            </View>
            <Text style={[s.muted, { marginTop: 2 }]}>{labels.get(item.type_key) ?? item.type_key}</Text>

            {item.status === "approved" ? (
              <Pressable
                style={[s.button, { marginTop: 12 }, busyId === item.id && s.buttonDisabled]}
                disabled={busyId === item.id}
                onPress={() => { void markHanded(item.id, list); }}
              >
                {busyId === item.id ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Mark handed over</Text>}
              </Pressable>
            ) : (
              <Text style={{ marginTop: 10, color: "#9a3412", fontSize: 13 }}>
                Handed {item.handed_at ? new Date(item.handed_at).toLocaleDateString() : ""} · awaiting supplier confirmation
              </Text>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}
