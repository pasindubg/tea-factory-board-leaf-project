import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import type { RequestType } from "@/lib/types";
import { colors, s } from "@/lib/theme";

// Generic request form: the fields are read from request_types.fields, so a new
// field is a DB change, not an app release. Creates a supplier_requests row with
// a client-generated UUID (offline idempotency, like weighings).
export default function NewRequest() {
  const params = useLocalSearchParams<{ key?: string | string[] }>();
  const key = Array.isArray(params.key) ? params.key[0] : params.key;
  const { profile, supplier } = useSession();
  const router = useRouter();
  const [type, setType] = useState<RequestType | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    supabase
      .from("request_types")
      .select("id, key, label, fields, requires_amount, creates_advance, sort_order")
      .eq("key", key)
      .maybeSingle()
      .then(({ data }) => setType((data as RequestType) ?? null));
  }, [key]);

  function setField(name: string, v: string | boolean) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function submit() {
    setError(null);
    if (!type) return;
    if (!profile || !supplier) return setError("Your supplier profile isn't loaded yet.");

    const amt = type.requires_amount ? Number(amount) : null;
    if (type.requires_amount && (!amount || Number.isNaN(amt as number) || (amt as number) <= 0)) {
      return setError("Enter an amount greater than 0.");
    }
    for (const f of type.fields ?? []) {
      if (f.required && !values[f.name]) return setError(`${f.label} is required.`);
    }

    setBusy(true);
    const { error } = await supabase.from("supplier_requests").insert({
      id: randomUUID(),
      factory_id: profile.factory_id,
      supplier_id: supplier.id,
      type_key: type.key,
      payload: values,
      amount: amt != null ? amt.toFixed(2) : null,
      status: "pending",
      note: note.trim() || null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/(supplier)/requests");
  }

  if (!type) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={[s.pad, { alignItems: "center", marginTop: 40 }]}>
          <ActivityIndicator color={colors.green} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={["bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
          <Text style={s.h1}>{type.label}</Text>

          {error && (
            <View style={[s.errorBox, { marginTop: 16 }]}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={{ marginTop: 20, gap: 16 }}>
            {type.requires_amount && (
              <View>
                <Text style={s.label}>Amount (LKR)</Text>
                <TextInput
                  style={[s.input, { fontSize: 20 }]}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.faint}
                />
              </View>
            )}

            {(type.fields ?? []).map((f) => (
              <View key={f.name}>
                <Text style={s.label}>
                  {f.label}
                  {f.required ? " *" : ""}
                </Text>
                {f.type === "boolean" ? (
                  <Switch
                    value={values[f.name] === true}
                    onValueChange={(v) => setField(f.name, v)}
                    trackColor={{ true: colors.green }}
                  />
                ) : (
                  <TextInput
                    style={s.input}
                    value={typeof values[f.name] === "string" ? (values[f.name] as string) : ""}
                    onChangeText={(v) => setField(f.name, v)}
                    keyboardType={f.type === "number" ? "decimal-pad" : "default"}
                    placeholder={f.type === "date" ? "YYYY-MM-DD" : ""}
                    placeholderTextColor={colors.faint}
                  />
                )}
              </View>
            ))}

            <View>
              <Text style={s.label}>Note (optional)</Text>
              <TextInput
                style={[s.input, { height: 80, textAlignVertical: "top" }]}
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Anything the factory should know"
                placeholderTextColor={colors.faint}
              />
            </View>

            <Pressable style={[s.button, { paddingVertical: 16 }, busy && s.buttonDisabled]} disabled={busy} onPress={submit}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={[s.buttonText, { fontSize: 16 }]}>Send request</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
