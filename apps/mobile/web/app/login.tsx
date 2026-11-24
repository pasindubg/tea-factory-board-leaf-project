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
import { SafeAreaView } from "@/runtime/safe-area";
import { signIn } from "@/lib/auth";
import { colors, s } from "@/lib/theme";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithPassword() {
    setBusy(true);
    setError(null);
    const result = await signIn(username.trim().toLowerCase(), password);
    setBusy(false);
    if (result.error) setError(result.error);
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

          {error && (
            <View style={[s.errorBox, { marginTop: 16 }]} accessibilityRole="alert">
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={{ marginTop: 20, gap: 14 }}>
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
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
