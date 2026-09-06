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
import { useSession } from "@/lib/session";
import { colors, s } from "@/lib/theme";

// Field officers sign in with a username and password and are bound to one
// phone. Phone/email OTP stays for suppliers and drivers (issue #13); email OTP
// is also the dev path while SMS is unconfigured.
type Method = "password" | "phone" | "email";

const DEVICE_MESSAGES: Record<string, string> = {
  blocked: "This login is already in use on another phone. Ask the factory to release it first.",
  invalid: "This phone could not be registered. Try again.",
};

export default function Login() {
  const { binding } = useSession();
  const [method, setMethod] = useState<Method>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"contact" | "code">("contact");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPhone = method === "phone";
  const value = contact.trim();

  async function signInWithPassword() {
    setBusy(true);
    setError(null);

    const { data: resolvedEmail, error: rpcError } = await supabase.rpc("get_email_for_login", {
      p_username: username.trim().toLowerCase(),
    });
    if (rpcError || !resolvedEmail) {
      setBusy(false);
      setError("No account with that username.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: resolvedEmail as string,
      password,
    });
    setBusy(false);
    // On success SessionProvider checks this phone against the login's binding
    // and the AuthGate routes to the role's home; a rejection comes back as
    // `binding` below, which survives this screen being remounted.
    if (signInError) setError("Incorrect password.");
  }

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
    setPassword("");
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
          <Text style={[s.muted, { marginTop: 4 }]}>For field officers, customers and drivers</Text>

          {(error ?? (binding ? DEVICE_MESSAGES[binding] : null)) && (
            <View style={[s.errorBox, { marginTop: 16 }]}>
              <Text style={s.errorText}>{error ?? DEVICE_MESSAGES[binding!]}</Text>
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
            <MethodTab label="Password" active={method === "password"} onPress={() => switchMethod("password")} />
            <MethodTab label="Phone" active={method === "phone"} onPress={() => switchMethod("phone")} />
            <MethodTab label="Email" active={method === "email"} onPress={() => switchMethod("email")} />
          </View>

          {method === "password" ? (
            <View style={{ marginTop: 16, gap: 14 }}>
              <View>
                <Text style={s.label}>Username</Text>
                <TextInput
                  style={s.input}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  placeholder="your.username"
                  placeholderTextColor={colors.faint}
                />
              </View>
              <View>
                <Text style={s.label}>Password</Text>
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                  placeholderTextColor={colors.faint}
                />
              </View>
              <Pressable
                style={[s.button, busy && s.buttonDisabled]}
                disabled={busy || !username.trim() || !password}
                onPress={signInWithPassword}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Sign in</Text>}
              </Pressable>
              <Text style={s.faint}>
                Your login works on this phone only. Ask the factory to release it if you change phones.
              </Text>
            </View>
          ) : step === "contact" ? (
            <View style={{ marginTop: 16, gap: 14 }}>
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
            <View style={{ marginTop: 16, gap: 14 }}>
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
