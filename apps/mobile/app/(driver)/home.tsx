import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import type { RequestType, SupplierRequest } from "@/lib/types";
import { colors, s } from "@/lib/theme";

// Driver route view: the cash/items the factory approved that this driver should
// hand to suppliers on the route. Marking "handed" sets handed_to_driver; the
// supplier then acknowledges on their own app, which is the cross-check that the
// driver actually delivered (issue #13). RLS lets a driver see all factory rows.
export default function DriverHome() {
  const { profile, signOut } = useSession();
  const [rows, setRows] = useState<SupplierRequest[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: reqs }, { data: types }] = await Promise.all([
      supabase
        .from("supplier_requests")
        .select("id, supplier_id, type_key, amount, status, note, requested_at, handed_at, acknowledged_at, suppliers(name)")
        .in("status", ["approved", "handed_to_driver"])
        .order("status"),
      supabase.from("request_types").select("key, label"),
    ]);
    setRows((reqs as unknown as SupplierRequest[]) ?? []);
    setLabels(new Map(((types as { key: string; label: string }[]) ?? []).map((t) => [t.key, t.label])));
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function markHanded(id: string) {
    if (!profile) return;
    setBusyId(id);
    await supabase
      .from("supplier_requests")
      .update({ status: "handed_to_driver", handed_by: profile.id, handed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "approved");
    setBusyId(null);
    await load();
  }

  const supplierName = (r: SupplierRequest) => r.suppliers?.name ?? "Supplier";

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={s.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Text style={s.h1}>Today&apos;s route</Text>
            <Text style={[s.muted, { marginTop: 2 }]}>Money &amp; items to hand over</Text>
          </View>
          <Pressable onPress={signOut} hitSlop={8}>
            <Text style={{ color: colors.green, fontSize: 14, fontWeight: "500" }}>Sign out</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 20, gap: 12 }}>
          {rows.map((r) => (
            <View key={r.id} style={s.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={s.h2}>{supplierName(r)}</Text>
                {r.amount != null && (
                  <Text style={{ fontWeight: "700", color: colors.text }}>LKR {Number(r.amount).toLocaleString()}</Text>
                )}
              </View>
              <Text style={[s.muted, { marginTop: 2 }]}>{labels.get(r.type_key) ?? r.type_key}</Text>

              {r.status === "approved" ? (
                <Pressable
                  style={[s.button, { marginTop: 12 }, busyId === r.id && s.buttonDisabled]}
                  disabled={busyId === r.id}
                  onPress={() => markHanded(r.id)}
                >
                  {busyId === r.id ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Mark handed over</Text>}
                </Pressable>
              ) : (
                <Text style={{ marginTop: 10, color: "#9a3412", fontSize: 13 }}>
                  Handed {r.handed_at ? new Date(r.handed_at).toLocaleDateString() : ""} · awaiting supplier confirmation
                </Text>
              )}
            </View>
          ))}
          {rows.length === 0 && (
            <View style={s.card}>
              <Text style={s.muted}>Nothing to hand over right now.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
