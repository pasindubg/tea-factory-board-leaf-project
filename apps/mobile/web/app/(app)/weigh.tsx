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
import { SafeAreaView } from "@/runtime/safe-area";
import { useFocusEffect, useRouter } from "@/runtime/navigation";
import { readResource, runCommand } from "@/lib/api";
import { useSession } from "@/lib/session";
import { SupplierPicker } from "@/components/SupplierPicker";
import type { Supplier } from "@/lib/types";
import { colors, s } from "@/lib/theme";

export default function Weigh() {
  const { profile, collector } = useSession();
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function loadSuppliers() {
        if (!profile || profile.role !== "collector") return;
        try {
          const { rows } = await readResource<{ rows: Supplier[] }>("collector.suppliers");
          if (active) setSuppliers(rows);
        } catch (error) {
          if (active) setError((error as Error).message);
        }
      }
      void loadSuppliers();
      return () => { active = false; };
    }, [profile]),
  );

  async function submit() {
    setError(null);
    setDone(null);
    const kg = Number(weight);
    if (!supplier) return setError("Pick a supplier.");
    if (!weight || Number.isNaN(kg) || kg <= 0) return setError("Enter a weight greater than 0.");
    if (!collector || !profile || profile.role !== "collector") return setError("Your collector profile isn't loaded yet.");

    setBusy(true);
    try {
      await runCommand({ action: "collector.weighing.create", id, supplierId: supplier.id, weightKg: kg.toFixed(2) });
    } catch (error) {
      setError((error as Error).message);
      return;
    } finally {
      setBusy(false);
    }
    setId(crypto.randomUUID());
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
