import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "@/runtime/safe-area";
import { useRouter } from "@/runtime/navigation";
import { NativeEntityList } from "@/components/NativeEntityList";
import { useSession } from "@/lib/session";
import { readResource } from "@/lib/api";
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
    const data = await readResource<{ rows: RequestType[]; unread: number }>("supplier.home");
    setUnread(data.unread);
    return data.rows;
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
