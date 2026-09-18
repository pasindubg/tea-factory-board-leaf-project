import * as SecureStore from "expo-secure-store";
import { apiBaseUrl } from "./env";

const SESSION_KEY = "neon-auth-session";
const USER_KEY = "neon-auth-user-id";

export type AuthSession = { user: { id: string } };
type Listener = (session: AuthSession | null) => void;

let loaded = false;
let session: string | null = null;
let userId: string | null = null;
let token: { value: string; exp: number } | null = null;
let refreshing: Promise<string | null> | null = null;
const listeners = new Set<Listener>();

function current(): AuthSession | null {
  return session && userId ? { user: { id: userId } } : null;
}

function emit() {
  const value = current();
  listeners.forEach((listener) => listener(value));
}

function expiryOf(jwt: string): number {
  const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))).exp;
}

function post(path: string, options: { bearer?: string; body?: unknown } = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.bearer ? { Authorization: `Bearer ${options.bearer}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function clear() {
  session = null;
  userId = null;
  token = null;
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function getSession(): Promise<AuthSession | null> {
  if (!loaded) {
    session = await SecureStore.getItemAsync(SESSION_KEY);
    userId = await SecureStore.getItemAsync(USER_KEY);
    loaded = true;
  }
  return current();
}

export function onAuthStateChange(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function signIn(username: string, password: string): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await post("/api/mobile/sign-in", { body: { username, password } });
  } catch {
    return { error: "Could not reach the server. Check your connection." };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error ?? "Sign-in failed." };

  await SecureStore.setItemAsync(SESSION_KEY, body.session);
  await SecureStore.setItemAsync(USER_KEY, body.userId);
  session = body.session;
  userId = body.userId;
  loaded = true;
  token = { value: body.token, exp: expiryOf(body.token) };
  emit();
  return { error: null };
}

export async function signOut() {
  const previous = session;
  await clear();
  emit();
  if (previous) post("/api/mobile/sign-out", { bearer: previous }).catch(() => {});
}

async function refresh(): Promise<string | null> {
  await getSession();
  if (!session) return null;
  let res: Response;
  try {
    res = await post("/api/mobile/token", { bearer: session });
  } catch {
    return null;
  }
  if (res.status === 401) {
    await clear();
    emit();
    return null;
  }
  if (!res.ok) return null;
  const { token: value } = await res.json();
  token = { value, exp: expiryOf(value) };
  return value;
}

export async function accessToken(): Promise<string | null> {
  if (token && token.exp - 60 > Date.now() / 1000) return token.value;
  refreshing ??= refresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}
