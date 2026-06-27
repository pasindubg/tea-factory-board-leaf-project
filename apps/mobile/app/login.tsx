import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors, s } from "@/lib/theme";

// Field-app login. Phone OTP is the primary method for suppliers/drivers (issue
// #13); email OTP is kept for development testing (db:mint-otp) until an SMS
// provider is configured — see docs/mobile/ARCHITECTURE.md "open decisions".
type Method = "phone" | "email";

export default function Login() {
  const [method, setMethod] = useState<Method>("phone");
  const [contact, setContact] = useState(""); // phone (E.164) or email
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"contact" | "code">("contact");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPhone = method === "phone";
  const value = contact.trim();

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp(
      isPhone
        ? { phone: value, options: { shouldCreateUser: false } }
        : { email: value, options: { shouldCreateUser: false } },
    );
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("code");
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp(
      isPhone
        ? { phone: value, token: code.trim(), type: "sms" }
        : { email: value, token: code.trim(), type: "email" },
    );
    setBusy(false);
    // On success the auth listener in SessionProvider flips the session and the
    // AuthGate routes to the role's home — nothing to do here.
    if (error) setError(error.message);
  }

  function switchMethod(next: Method) {
    setMethod(next);
    setContact("");
    setCode("");
    setStep("contact");
    setError(null);
  }

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "center", padding: 20 }}
      >
        <View style={s.card}>
          <Text style={s.h1}>Tea Factory — Field App</Text>
          <Text style={[s.muted, { marginTop: 4 }]}>For suppliers and drivers</Text>

          {error && (
            <View style={[s.errorBox, { marginTop: 16 }]}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {step === "contact" ? (
            <View style={{ marginTop: 20, gap: 14 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <MethodTab label="Phone" active={isPhone} onPress={() => switchMethod("phone")} />
                <MethodTab label="Email" active={!isPhone} onPress={() => switchMethod("email")} />
              </View>
              <View>
                <Text style={s.label}>{isPhone ? "Phone number" : "Email"}</Text>
                <TextInput
                  style={s.input}
                  value={contact}
                  onChangeText={setContact}
                  autoCapitalize="none"
                  keyboardType={isPhone ? "phone-pad" : "email-address"}
                  autoComplete={isPhone ? "tel" : "email"}
                  placeholder={isPhone ? "+9477xxxxxxx" : "you@factory.lk"}
                  placeholderTextColor={colors.faint}
                />
              </View>
              <Pressable style={[s.button, busy && s.buttonDisabled]} disabled={busy || !value} onPress={sendCode}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Send sign-in code</Text>}
              </Pressable>
              <Pressable onPress={() => value && setStep("code")}>
                <Text style={s.linkText}>I already have a code</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ marginTop: 20, gap: 14 }}>
              <Text style={s.muted}>
                We sent a code to <Text style={{ fontWeight: "600" }}>{value}</Text>. Enter it below.
              </Text>
              <View>
                <Text style={s.label}>Code</Text>
                <TextInput
                  style={[s.input, { letterSpacing: 4 }]}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  placeholder="123456"
                  placeholderTextColor={colors.faint}
                />
              </View>
              <Pressable style={[s.button, busy && s.buttonDisabled]} disabled={busy || !code} onPress={verifyCode}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Sign in</Text>}
              </Pressable>
              <Pressable onPress={() => setStep("contact")}>
                <Text style={s.linkText}>Use a different {isPhone ? "number" : "email"}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MethodTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: "center",
        backgroundColor: active ? colors.green : "#f5f5f4",
      }}
    >
      <Text style={{ color: active ? "#fff" : colors.muted, fontWeight: "600", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
