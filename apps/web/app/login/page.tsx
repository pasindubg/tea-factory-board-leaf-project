"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorMessages: Record<string, string> = {
    deactivated: "Your account has been deactivated. Contact your factory owner.",
    no_profile: "Your login isn't linked to any factory. Contact your factory owner.",
  };
  const errorParam = searchParams.get("error");

  // "otp" = email one-time code, "password" = username + password
  const [mode, setMode] = useState<"otp" | "password">("otp");

  // OTP state
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");

  // Password state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(errorParam ? (errorMessages[errorParam] ?? null) : null);

  // ── OTP handlers ──────────────────────────────────────────────────────────

  async function sendCode(e: React.SyntheticEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setOtpStep("code");
  }

  async function verifyCode(e: React.SyntheticEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (!error) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    setBusy(false);
    setError(error.message);
  }

  // ── Password handler ──────────────────────────────────────────────────────

  async function signInWithPassword(e: React.SyntheticEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();

    // Resolve username → email via the SECURITY DEFINER RPC (accessible to anon).
    const { data: resolvedEmail, error: rpcErr } = await supabase.rpc("get_email_for_login", {
      p_username: username.trim().toLowerCase(),
    });
    if (rpcErr || !resolvedEmail) {
      setBusy(false);
      setError("Invalid credentials.");
      return;
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: resolvedEmail as string,
      password,
    });
    if (signInErr) {
      setBusy(false);
      setError("Invalid credentials.");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  // ── Mode toggle ───────────────────────────────────────────────────────────

  function switchMode(next: "otp" | "password") {
    setError(null);
    setMode(next);
    setOtpStep("email");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Tea Factory Ops</h1>
        <p className="mt-1 text-sm text-stone-500">Sign in to your factory dashboard</p>

        {/* Mode tabs */}
        <div className="mt-5 flex rounded-lg border border-stone-200 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => switchMode("otp")}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
              mode === "otp"
                ? "bg-green-700 text-white"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            Email code
          </button>
          <button
            type="button"
            onClick={() => switchMode("password")}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
              mode === "password"
                ? "bg-green-700 text-white"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            Username
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {/* ── OTP flow ── */}
        {mode === "otp" && otpStep === "email" && (
          <form onSubmit={sendCode} className="mt-5 space-y-4">
            <label className="block text-sm font-medium">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@factory.lk"
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send sign-in code"}
            </button>
            <button
              type="button"
              onClick={() => { if (email) { setError(null); setOtpStep("code"); } }}
              className="w-full text-sm text-stone-500 hover:text-stone-700"
            >
              I already have a code
            </button>
          </form>
        )}

        {mode === "otp" && otpStep === "code" && (
          <form onSubmit={verifyCode} className="mt-5 space-y-4">
            <p className="text-sm text-stone-600">
              We sent a sign-in email to <span className="font-medium">{email}</span>. Enter the
              code, or click the link in the email.
            </p>
            <label className="block text-sm font-medium">
              Code
              <input
                inputMode="numeric"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className={`${inputClass} tracking-widest`}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Sign in"}
            </button>
            <button type="button" onClick={() => setOtpStep("email")} className="w-full text-sm text-stone-500 hover:text-stone-700">
              Use a different email
            </button>
          </form>
        )}

        {/* ── Password flow ── */}
        {mode === "password" && (
          <form onSubmit={signInWithPassword} className="mt-5 space-y-4">
            <label className="block text-sm font-medium">
              Username
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your.username"
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
