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

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
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
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    // On success the auth listener in SessionProvider flips the session and the
    // AuthGate redirects to /home — nothing to do here.
    if (error) setError(error.message);
  }

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "center", padding: 20 }}
      >
        <View style={s.card}>
          <Text style={s.h1}>Tea Factory Collector</Text>
          <Text style={[s.muted, { marginTop: 4 }]}>Sign in to record leaf collection</Text>

          {error && (
            <View style={[s.errorBox, { marginTop: 16 }]}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {step === "email" ? (
            <View style={{ marginTop: 20, gap: 14 }}>
              <View>
                <Text style={s.label}>Email</Text>
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="you@factory.lk"
                  placeholderTextColor={colors.faint}
                />
              </View>
              <Pressable
                style={[s.button, busy && s.buttonDisabled]}
                disabled={busy || !email}
                onPress={sendCode}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Send sign-in code</Text>}
              </Pressable>
              <Pressable onPress={() => email && setStep("code")}>
                <Text style={s.linkText}>I already have a code</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ marginTop: 20, gap: 14 }}>
              <Text style={s.muted}>
                We sent a code to <Text style={{ fontWeight: "600" }}>{email}</Text>. Enter it below.
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
              <Pressable
                style={[s.button, busy && s.buttonDisabled]}
                disabled={busy || !code}
                onPress={verifyCode}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Sign in</Text>}
              </Pressable>
              <Pressable onPress={() => setStep("email")}>
                <Text style={s.linkText}>Use a different email</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
