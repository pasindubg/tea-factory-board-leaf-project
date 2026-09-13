import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Application from "expo-application";

const DEVICE_KEY = "tea-factory.device-id";

let cached: string | null = null;

// Web (Expo web preview) has no SecureStore; fall back to localStorage so the
// dev flow still works. Real field installs are native.
const webStore = {
  get: (key: string) => (typeof localStorage === "undefined" ? null : localStorage.getItem(key)),
  set: (key: string, value: string) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
};

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  const existing =
    Platform.OS === "web" ? webStore.get(DEVICE_KEY) : await SecureStore.getItemAsync(DEVICE_KEY);
  if (existing) {
    cached = existing;
    return existing;
  }

  const created = Crypto.randomUUID();
  if (Platform.OS === "web") webStore.set(DEVICE_KEY, created);
  else await SecureStore.setItemAsync(DEVICE_KEY, created);
  cached = created;
  return created;
}

export function deviceDescription() {
  return {
    platform: Platform.OS,
    model: `${Platform.OS} ${Platform.Version}`,
    appVersion: Application.nativeApplicationVersion ?? null,
  };
}
