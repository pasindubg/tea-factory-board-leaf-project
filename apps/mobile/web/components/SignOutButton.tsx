import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSession } from "@/lib/session";
import { s } from "@/lib/theme";

export function SignOutButton() {
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: 20, gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={handleSignOut}
        style={[s.button, busy && s.buttonDisabled]}
      >
        <Text style={s.buttonText}>{busy ? "Signing out…" : "Sign out and switch account"}</Text>
      </Pressable>
      {error && (
        <View style={s.errorBox} accessibilityRole="alert">
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}
