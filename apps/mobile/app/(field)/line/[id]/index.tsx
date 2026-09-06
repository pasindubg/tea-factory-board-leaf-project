import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { colors, s } from "@/lib/theme";
import type { CustomerRow } from "@/lib/types";

export default function LineCustomers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const router = useRouter();
  const [line, setLine] = useState<{ line_no: string; name: string | null } | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile || !id) return;
    const [lineResult, customerResult] = await Promise.all([
      supabase.from("lines").select("line_no, name").eq("id", id).maybeSingle(),
      supabase
        .from("suppliers")
        .select("id, customer_no, name, phone, address, latitude, longitude")
        .eq("factory_id", profile.factory_id)
        .eq("line_id", id)
        .order("name"),
    ]);
    if (customerResult.error) setError(customerResult.error.message);
    else {
      setError(null);
      setCustomers((customerResult.data ?? []) as CustomerRow[]);
    }
    setLine((lineResult.data as { line_no: string; name: string | null } | null) ?? null);
    setLoading(false);
  }, [id, profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <SafeAreaView style={[s.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.green} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={["bottom"]}>
      <FlatList
        data={customers}
        keyExtractor={(customer) => customer.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.green} />}
        ListHeaderComponent={
          <View style={{ marginBottom: 6 }}>
            <Text style={s.h1}>Line {line?.line_no ?? ""}</Text>
            <Text style={[s.muted, { marginTop: 4 }]}>
              {customers.length} customer{customers.length === 1 ? "" : "s"} registered
            </Text>
            {error && (
              <View style={[s.errorBox, { marginTop: 12 }]}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={s.card}>
            <Text style={s.muted}>No customers on this line yet. Tap Add customer to register the first.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.h2}>
              {item.customer_no} · {item.name}
            </Text>
            <Text style={[s.muted, { marginTop: 4 }]}>{item.phone}</Text>
            {item.address ? <Text style={s.faint}>{item.address}</Text> : null}
            <Text style={[s.faint, { marginTop: 4 }]}>
              📍 {Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}
            </Text>
          </View>
        )}
      />
      <View style={{ position: "absolute", left: 16, right: 16, bottom: 24 }}>
        <Pressable style={s.button} onPress={() => router.push(`/(field)/line/${id}/new`)}>
          <Text style={s.buttonText}>Add customer</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
