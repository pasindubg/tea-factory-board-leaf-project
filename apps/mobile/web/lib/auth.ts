import { loadSession, saveSession } from "./bridge";
import { apiBaseUrl } from "./env";
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
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
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
  try { await saveSession(null); }
  finally { emit(); }
}

export async function getSession(): Promise<AuthSession | null> {
  if (!loaded) {
    const saved = await loadSession();
    session = saved?.session ?? null;
    userId = saved?.userId ?? null;
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
  if (!res.ok || typeof body.session !== "string" || typeof body.userId !== "string" || typeof body.token !== "string") {
    return { error: typeof body.error === "string" ? body.error : "Sign-in failed." };
  }

  try {
    token = { value: body.token, exp: expiryOf(body.token) };
    await saveSession({ session: body.session, userId: body.userId });
  } catch (error) {
    token = null;
    return { error: error instanceof Error ? error.message : "Unable to save your session." };
  }
  session = body.session;
  userId = body.userId;
  loaded = true;
  emit();
  return { error: null };
}

export async function signOut() {
  const previous = session;
  try { await clear(); }
  finally {
    if (previous) post("/api/mobile/sign-out", { bearer: previous }).catch(() => {});
  }
}

async function refresh(): Promise<string | null> {
  await getSession();
  if (!session) return null;
  const previous = session;
  let res: Response;
  try {
    res = await post("/api/mobile/token", { bearer: previous });
  } catch {
    throw new Error("Could not reach the server. Check your connection.");
  }
  if (previous !== session) return null;
  if (res.status === 401) {
    await clear();
    return null;
  }
  if (!res.ok) throw new Error("Could not verify your session. Please try again.");
  const { token: value } = await res.json();
  if (previous !== session) return null;
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
