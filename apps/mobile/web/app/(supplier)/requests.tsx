import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "@/runtime/safe-area";
import { useRouter } from "@/runtime/navigation";
import type { FrameworkListController } from "@tea/ui/list-controller";
import { NativeEntityList } from "@/components/NativeEntityList";
import { useSession } from "@/lib/session";
import { readResource, runCommand } from "@/lib/api";
import { colors, s } from "@/lib/theme";
import type { SupplierRequest } from "@/lib/types";

export default function MyRequests() {
  const { profile, supplier } = useSession();
  const router = useRouter();
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!profile || profile.role !== "supplier" || !supplier) return [];
    const data = await readResource<{ rows: SupplierRequest[]; labels: Record<string, string> }>("supplier.requests");
    setLabels(new Map(Object.entries(data.labels)));
    return data.rows;
  }, [profile, supplier]);
  async function acknowledge(id: string, list: FrameworkListController<SupplierRequest>) {
    if (!profile || profile.role !== "supplier" || !supplier) return;
    setBusyId(id);
    await list.runMutation(async () => {
      await runCommand({ action: "supplier.request.acknowledge", id });
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
