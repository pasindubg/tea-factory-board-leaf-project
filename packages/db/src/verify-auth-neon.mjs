import { createClient } from "@supabase/supabase-js";

const AUTH = process.env.NEXT_PUBLIC_NEON_AUTH_BASE_URL;
const DATA = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
const ORIGIN = "http://localhost:3000";

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
};

async function post(path, body, cookie) {
  const h = { Origin: ORIGIN, "Content-Type": "application/json" };
  if (cookie) h.Cookie = cookie;
  const r = await fetch(`${AUTH}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => null), setCookie: r.headers.getSetCookie() };
}
async function get(path, cookie) {
  const h = { Origin: ORIGIN };
  if (cookie) h.Cookie = cookie;
  const r = await fetch(`${AUTH}${path}`, { headers: h });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) };
}
const jar = (setCookie) => setCookie.map((c) => c.split(";")[0]).join("; ");

const signIn = await post("/sign-in/email", { email: "spike@example.com", password: "Sp1ke-Test-Passw0rd!" });
check("signInWithPassword equivalent", signIn.ok && !!signIn.json?.user?.id, signIn.ok ? `user ${signIn.json.user.id}` : `status ${signIn.status}`);
const cookie = jar(signIn.setCookie);

const session = await get("/get-session", cookie);
check("getSession equivalent", !!session.json?.user?.id, session.json?.user?.email ?? "no session");

const tok = await get("/token", cookie);
const jwt = tok.json?.token;
check("token exchange for Data API", !!jwt, jwt ? `${jwt.length} chars` : "no token");

const claims = jwt ? JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()) : {};
check("JWT carries role=authenticated", claims.role === "authenticated", `role=${claims.role}`);
check("JWT sub is the user uuid", claims.sub === signIn.json?.user?.id, `sub=${claims.sub}`);

const db = createClient(DATA, "unused", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: `Bearer ${jwt}` } },
});
const sup = await db.from("suppliers").select("name, factory_id");
const factories = new Set((sup.data ?? []).map((r) => r.factory_id));
check("RLS scopes suppliers to one factory", !sup.error && factories.size === 1, sup.error ? sup.error.message : `${sup.data.length} rows, ${factories.size} factory`);

const fac = await db.from("factories").select("id,name");
check("RLS scopes factories to one row", !fac.error && fac.data.length === 1, fac.error ? fac.error.message : fac.data[0]?.name);

const rpc = await db.rpc("current_factory_id");
check("current_factory_id() resolves through the API", !rpc.error && !!rpc.data, rpc.error ? rpc.error.message : rpc.data);

const out = await post("/sign-out", {}, cookie);
const after = await get("/get-session", cookie);
check("signOut equivalent ends the session", out.ok && !after.json?.user, out.ok ? "session cleared" : `status ${out.status}`);

const bad = await post("/sign-in/email", { email: "spike@example.com", password: "wrong-password" });
check("wrong password refused", !bad.ok, `status ${bad.status}`);

console.log(failures === 0 ? "\nM3 auth bridge: ALL CHECKS PASSED" : `\nM3 auth bridge: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
