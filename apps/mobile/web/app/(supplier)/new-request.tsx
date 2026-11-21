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
import { SafeAreaView } from "@/runtime/safe-area";
import { useLocalSearchParams, useRouter } from "@/runtime/navigation";
import { readResource, runCommand } from "@/lib/api";
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
  const [requestId] = useState(() => crypto.randomUUID());
  const [type, setType] = useState<RequestType | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key || !profile || profile.role !== "supplier") return;
    const requestKey = key;
    let active = true;
    async function loadRequestType() {
      try {
        const { requestType } = await readResource<{ requestType: RequestType }>("supplier.request-type", { key: requestKey });
        if (active) setType(requestType);
      } catch (error) {
        if (active) setError((error as Error).message);
      }
    }
    void loadRequestType();
    return () => { active = false; };
  }, [key, profile]);

  function setField(name: string, v: string | boolean) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function submit() {
    setError(null);
    if (!type) return;
    if (!profile || profile.role !== "supplier" || !supplier) return setError("Your supplier profile isn't loaded yet.");

    const amt = type.requires_amount ? Number(amount) : null;
    if (type.requires_amount && (!amount || Number.isNaN(amt as number) || (amt as number) <= 0)) {
      return setError("Enter an amount greater than 0.");
    }
    for (const f of type.fields ?? []) {
      if (f.required && (values[f.name] == null || values[f.name] === "")) return setError(`${f.label} is required.`);
    }

    setBusy(true);
    try {
      await runCommand({ action: "supplier.request.create", id: requestId, typeKey: type.key, payload: values, amount: amt?.toFixed(2) ?? null, note: note.trim() || null });
      router.replace("/(supplier)/requests");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!type) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={[s.pad, { alignItems: "center", marginTop: 40 }]}>
          {error ? (
            <View style={s.errorBox} accessibilityRole="alert">
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : (
            <ActivityIndicator color={colors.green} />
          )}
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
