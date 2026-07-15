import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useFrameworkListController } from "@tea/ui/list-controller";
import { NativeFrameworkList } from "@/components/NativeFrameworkList";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors, s } from "@/lib/theme";
import type { SupplierRequest } from "@/lib/types";

// Driver route view: approved cash/items for this factory. Every query carries
// the authenticated profile's factory boundary in addition to RLS.
export default function DriverHome() {
  const { profile, signOut } = useSession();
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!profile || profile.role !== "driver") return [];
    const [requestsResult, typesResult] = await Promise.all([
      supabase
        .from("supplier_requests")
        .select("id, supplier_id, type_key, amount, status, note, requested_at, handed_at, acknowledged_at, suppliers(name)")
        .eq("factory_id", profile.factory_id)
        .in("status", ["approved", "handed_to_driver"])
        .order("status"),
      supabase
        .from("request_types")
        .select("key, label")
        .eq("factory_id", profile.factory_id),
    ]);
    if (requestsResult.error) throw requestsResult.error;
    if (typesResult.error) throw typesResult.error;

    setLabels(new Map(
      ((typesResult.data as { key: string; label: string }[]) ?? []).map((type) => [type.key, type.label]),
    ));
    return (requestsResult.data as unknown as SupplierRequest[]) ?? [];
  }, [profile]);
  const list = useFrameworkListController(loadRows);

  useFocusEffect(useCallback(() => {
    void list.reload();
  }, [list.reload, loadRows]));

  async function markHanded(id: string) {
    if (!profile || profile.role !== "driver") return;
    setBusyId(id);
    await list.runMutation(async () => {
      const { data, error } = await supabase
        .from("supplier_requests")
        .update({
          status: "handed_to_driver",
          handed_by: profile.id,
          handed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("factory_id", profile.factory_id)
        .eq("status", "approved")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This request is no longer approved for handoff. Pull down to refresh the route.");
    });
    setBusyId(null);
  }

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <NativeFrameworkList
        list={list}
        title="Today's route"
        description="Money and items to hand over"
        actions={(
          <Pressable onPress={signOut} hitSlop={8}>
            <Text style={{ color: colors.green, fontSize: 14, fontWeight: "500" }}>Sign out</Text>
          </Pressable>
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.pad}
        emptyMessage="Nothing to hand over right now."
        renderItem={({ item }) => (
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
                onPress={() => { void markHanded(item.id); }}
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
