import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import type { RequestType, SupplierRequest } from "@/lib/types";
import { colors, s } from "@/lib/theme";

// A supplier's own requests (RLS scopes the table to their supplier_id, so no
// explicit filter is needed). The Acknowledge button closes the money-handover
// trust loop: confirming receipt flips handed_to_driver → acknowledged.
export default function MyRequests() {
  const [rows, setRows] = useState<SupplierRequest[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: reqs }, { data: types }] = await Promise.all([
      supabase
        .from("supplier_requests")
        .select("id, supplier_id, type_key, amount, status, note, requested_at, handed_at, acknowledged_at")
        .order("requested_at", { ascending: false }),
      supabase.from("request_types").select("key, label"),
    ]);
    setRows((reqs as SupplierRequest[]) ?? []);
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

  async function acknowledge(id: string) {
    setBusyId(id);
    // Guard the transition so only a handed-to-driver row can be acknowledged.
    await supabase
      .from("supplier_requests")
      .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "handed_to_driver");
    setBusyId(null);
    await load();
  }

  return (
    <SafeAreaView style={s.screen} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={s.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
      >
        <View style={{ gap: 12 }}>
          {rows.map((r) => (
            <View key={r.id} style={s.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={s.h2}>{labels.get(r.type_key) ?? r.type_key}</Text>
                <StatusBadge status={r.status} />
              </View>
              {r.amount != null && (
                <Text style={[s.muted, { marginTop: 4 }]}>LKR {Number(r.amount).toLocaleString()}</Text>
              )}
              <Text style={[s.faint, { marginTop: 4 }]}>
                Requested {new Date(r.requested_at).toLocaleDateString()}
                {r.note ? ` · ${r.note}` : ""}
              </Text>

              {r.status === "handed_to_driver" && (
                <Pressable
                  style={[s.button, { marginTop: 12 }, busyId === r.id && s.buttonDisabled]}
                  disabled={busyId === r.id}
                  onPress={() => acknowledge(r.id)}
                >
                  {busyId === r.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.buttonText}>✓ Confirm I received the money</Text>
                  )}
                </Pressable>
              )}
              {r.status === "acknowledged" && r.acknowledged_at && (
                <Text style={{ marginTop: 8, color: colors.greenDark, fontSize: 13 }}>
                  ✓ You confirmed receipt on {new Date(r.acknowledged_at).toLocaleDateString()}
                </Text>
              )}
            </View>
          ))}
          {rows.length === 0 && (
            <View style={s.card}>
              <Text style={s.muted}>No requests yet. Raise one from the home screen.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending: { bg: "#fef9c3", fg: "#854d0e", label: "Pending" },
    approved: { bg: "#dbeafe", fg: "#1e40af", label: "Approved" },
    declined: { bg: "#f5f5f4", fg: "#78716c", label: "Declined" },
    handed_to_driver: { bg: "#ffedd5", fg: "#9a3412", label: "Sent with driver" },
    acknowledged: { bg: "#dcfce7", fg: "#166534", label: "Received" },
    cancelled: { bg: "#f5f5f4", fg: "#78716c", label: "Cancelled" },
  };
  const t = map[status] ?? { bg: "#f5f5f4", fg: "#78716c", label: status };
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: "600" }}>{t.label}</Text>
    </View>
  );
}
