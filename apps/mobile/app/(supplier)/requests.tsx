import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import type { FrameworkListController } from "@tea/ui/list-controller";
import { NativeEntityList } from "@/components/NativeEntityList";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors, s } from "@/lib/theme";
import type { SupplierRequest } from "@/lib/types";

export default function MyRequests() {
  const { profile, supplier } = useSession();
  const router = useRouter();
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!profile || profile.role !== "supplier" || !supplier) return [];
    const [requestsResult, typesResult] = await Promise.all([
      supabase
        .from("supplier_requests")
        .select("id, supplier_id, type_key, amount, status, note, requested_at, handed_at, acknowledged_at")
        .eq("factory_id", profile.factory_id)
        .eq("supplier_id", supplier.id)
        .order("requested_at", { ascending: false }),
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
    return (requestsResult.data as SupplierRequest[]) ?? [];
  }, [profile, supplier]);
  async function acknowledge(id: string, list: FrameworkListController<SupplierRequest>) {
    if (!profile || profile.role !== "supplier" || !supplier) return;
    setBusyId(id);
    await list.runMutation(async () => {
      const { data, error } = await supabase
        .from("supplier_requests")
        .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
        .eq("id", id)
        .eq("factory_id", profile.factory_id)
        .eq("supplier_id", supplier.id)
        .eq("status", "handed_to_driver")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This request is no longer awaiting acknowledgement. Pull down to refresh.");
    });
    setBusyId(null);
  }

  return (
    <SafeAreaView style={s.screen} edges={["bottom"]}>
      <NativeEntityList
        loadRows={loadRows}
        title="Request history"
        description="Requests sent to your factory and their current status."
        onCreate={() => router.replace("/(supplier)/home")}
        canCreate={Boolean(profile?.role === "supplier" && supplier)}
        createDisabledReason="Your supplier profile must be loaded before creating a request."
        createLabel="New request"
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.pad}
        emptyMessage="No requests yet. Raise one from the home screen."
        renderItem={({ item }, list) => (
          <View style={[s.card, { marginBottom: 12 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={s.h2}>{labels.get(item.type_key) ?? item.type_key}</Text>
              <StatusBadge status={item.status} />
            </View>
            {item.amount != null && (
              <Text style={[s.muted, { marginTop: 4 }]}>LKR {Number(item.amount).toLocaleString()}</Text>
            )}
            <Text style={[s.faint, { marginTop: 4 }]}>
              Requested {new Date(item.requested_at).toLocaleDateString()}
              {item.note ? ` · ${item.note}` : ""}
            </Text>

            {item.status === "handed_to_driver" && (
              <Pressable
                style={[s.button, { marginTop: 12 }, busyId === item.id && s.buttonDisabled]}
                disabled={busyId === item.id}
                onPress={() => { void acknowledge(item.id, list); }}
              >
                {busyId === item.id ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.buttonText}>✓ Confirm I received the money</Text>
                )}
              </Pressable>
            )}
            {item.status === "acknowledged" && item.acknowledged_at && (
              <Text style={{ marginTop: 8, color: colors.greenDark, fontSize: 13 }}>
                ✓ You confirmed receipt on {new Date(item.acknowledged_at).toLocaleDateString()}
              </Text>
            )}
          </View>
        )}
      />
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
  const tone = map[status] ?? { bg: "#f5f5f4", fg: "#78716c", label: status };
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: tone.fg, fontSize: 12, fontWeight: "600" }}>{tone.label}</Text>
    </View>
  );
}
