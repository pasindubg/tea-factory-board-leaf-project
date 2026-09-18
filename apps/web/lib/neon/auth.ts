export type NeonSession = {
  user: { id: string; email: string; name?: string | null; role?: string | null };
  session: { id: string; expiresAt: string };
};

function authBaseUrl() {
  const url = process.env.NEXT_PUBLIC_NEON_AUTH_BASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_NEON_AUTH_BASE_URL must be set");
  return url.replace(/\/$/, "");
}

function originHeader() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

type CallOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  cookie?: string;
};

type CallResult<T> = { data: T | null; error: string | null; status: number; setCookie: string[] };

async function call<T>(path: string, options: CallOptions = {}): Promise<CallResult<T>> {
  const { method = "GET", body, cookie } = options;

  const headers: Record<string, string> = { Origin: originHeader() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;

  let response: Response;
  try {
    response = await fetch(`${authBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (cause) {
    return { data: null, error: `Auth service unreachable: ${String(cause)}`, status: 0, setCookie: [] };
  }

  const setCookie = response.headers.getSetCookie?.() ?? [];
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : `Auth request failed (${response.status})`;
    return { data: null, error: message, status: response.status, setCookie };
  }

  return { data: parsed as T, error: null, status: response.status, setCookie };
}

export async function getSession(cookie: string) {
  const { data, error, status } = await call<NeonSession | null>("/get-session", { cookie });
  if (status === 401) return { session: null, error: null };
  return { session: data?.user ? data : null, error };
}

export async function getAccessToken(cookie: string) {
  const { data, error, status } = await call<{ token: string }>("/token", { cookie });
  if (status === 401) return { token: null, error: null };
  return { token: data?.token ?? null, error };
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error, setCookie } = await call<{ user: NeonSession["user"] }>("/sign-in/email", {
    method: "POST",
    body: { email, password },
  });
  return { user: data?.user ?? null, error, setCookie };
}

export async function signOut(cookie: string) {
  const { error, setCookie } = await call("/sign-out", { method: "POST", body: {}, cookie });
  return { error, setCookie };
}

export async function changeOwnPassword(cookie: string, newPassword: string, currentPassword: string) {
  const { error } = await call("/change-password", {
    method: "POST",
    body: { newPassword, currentPassword },
    cookie,
  });
  return { error };
}

export const admin = {
  async createUser(cookie: string, input: { email: string; password: string; name?: string }) {
    const { data, error } = await call<{ user: { id: string } }>("/admin/create-user", {
      method: "POST",
      body: input,
      cookie,
    });
    return { id: data?.user?.id ?? null, error };
  },

  async listUsers(cookie: string, limit = 1000) {
    const { data, error } = await call<{ users: NeonSession["user"][] }>(
      `/admin/list-users?limit=${limit}`,
      { cookie },
    );
    return { users: data?.users ?? [], error };
  },

  async removeUser(cookie: string, userId: string) {
    const { error } = await call("/admin/remove-user", {
      method: "POST",
      body: { userId },
      cookie,
    });
    return { error };
  },

  async updateUser(cookie: string, userId: string, fields: Record<string, unknown>) {
    const { error } = await call("/admin/update-user", {
      method: "POST",
      body: { userId, data: fields },
      cookie,
    });
    return { error };
  },

  async setPassword(cookie: string, userId: string, newPassword: string) {
    const { error } = await call("/admin/set-user-password", {
      method: "POST",
      body: { userId, newPassword },
      cookie,
    });
    return { error };
  },
};
