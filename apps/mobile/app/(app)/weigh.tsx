import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { SupplierPicker } from "@/components/SupplierPicker";
import type { Supplier } from "@/lib/types";
import { colors, s } from "@/lib/theme";

export default function Weigh() {
  const { profile, collector } = useSession();
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Suppliers in this collector's factory (RLS already scopes to the factory).
  useFocusEffect(
    useCallback(() => {
      supabase
        .from("suppliers")
        .select("id, name, area")
        .eq("active", true)
        .order("name")
        .then(({ data }) => setSuppliers((data as Supplier[]) ?? []));
    }, []),
  );

  async function submit() {
    setError(null);
    setDone(null);
    const kg = Number(weight);
    if (!supplier) return setError("Pick a supplier.");
    if (!weight || Number.isNaN(kg) || kg <= 0) return setError("Enter a weight greater than 0.");
    if (!collector || !profile) return setError("Your collector profile isn't loaded yet.");

    setBusy(true);
    // Client-generated UUID from day one (M5 offline sync reuses this id as the
    // idempotency key — retrying a push never duplicates a weighing).
    const { error } = await supabase.from("weighings").insert({
      id: randomUUID(),
      factory_id: profile.factory_id,
      supplier_id: supplier.id,
      collector_id: collector.id,
      weight_kg: kg.toFixed(2),
      collected_at: new Date().toISOString(),
      synced_at: new Date().toISOString(), // online-only in M4: written = synced
    });
    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }
    setDone(`Recorded ${kg.toFixed(2)} kg for ${supplier.name}.`);
    setSupplier(null);
    setWeight("");
  }

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
          <Text style={s.h1}>Record weighing</Text>

          {done && (
            <View style={{ backgroundColor: "#f0fdf4", borderRadius: 8, padding: 12, marginTop: 16 }}>
              <Text style={{ color: colors.greenDark, fontSize: 14 }}>{done}</Text>
            </View>
          )}
          {error && (
            <View style={[s.errorBox, { marginTop: 16 }]}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={{ marginTop: 20, gap: 16 }}>
            <View>
              <Text style={s.label}>Supplier</Text>
              <SupplierPicker suppliers={suppliers} selected={supplier} onSelect={setSupplier} />
            </View>

            <View>
              <Text style={s.label}>Weight (kg)</Text>
              <TextInput
                style={[s.input, { fontSize: 20 }]}
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.faint}
              />
            </View>

            <Pressable
              style={[s.button, { paddingVertical: 16 }, busy && s.buttonDisabled]}
              disabled={busy}
              onPress={submit}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={[s.buttonText, { fontSize: 16 }]}>Submit</Text>}
            </Pressable>

            <Pressable onPress={() => router.push("/(app)/records")}>
              <Text style={s.linkText}>View today&apos;s records</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
