"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white/80 px-4 py-3 text-sm shadow-inner outline-none transition focus:border-green-700 focus:ring-2 focus:ring-green-700/20 dark:border-stone-600 dark:bg-stone-900/80 dark:focus:border-green-400 dark:focus:ring-green-400/20";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorMessages: Record<string, string> = {
    deactivated: "Your account has been deactivated. Contact your factory owner.",
    no_profile: "Your login isn't linked to any factory. Contact your factory owner.",
    session_refresh_failed: "Your saved session could not be refreshed. Please sign in again.",
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8faf3] p-4 dark:bg-[#10140e]">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-green-200/50 blur-3xl dark:bg-green-900/30" />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-lime-100/70 blur-3xl dark:bg-lime-950/30" />
      <div className="relative w-full max-w-md rounded-[2rem] border border-stone-200/80 bg-white/90 p-8 shadow-[0_24px_70px_rgba(25,29,23,0.12)] backdrop-blur-xl dark:border-stone-700/80 dark:bg-stone-900/90 sm:p-10">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-700 text-xl font-bold text-white shadow-lg shadow-green-800/20 dark:bg-green-500 dark:text-green-950">T</div>
        <h1 className="text-2xl font-semibold tracking-tight">Tea Factory Ops</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Sign in to your factory dashboard</p>

        {/* Mode tabs */}
        <div className="mt-6 flex rounded-2xl bg-stone-100 p-1.5 text-sm dark:bg-stone-800">
          <button
            type="button"
            onClick={() => switchMode("otp")}
            className={`min-h-10 flex-1 rounded-xl px-3 py-2 font-medium transition-colors ${
              mode === "otp"
                ? "bg-white text-green-800 shadow-sm dark:bg-stone-700 dark:text-green-300"
                : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
            }`}
          >
            Email code
          </button>
          <button
            type="button"
            onClick={() => switchMode("password")}
            className={`min-h-10 flex-1 rounded-xl px-3 py-2 font-medium transition-colors ${
              mode === "password"
                ? "bg-white text-green-800 shadow-sm dark:bg-stone-700 dark:text-green-300"
                : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
            }`}
          >
            Username
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
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
              className="min-h-12 w-full rounded-full bg-green-700 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-green-800/15 hover:bg-green-800 disabled:opacity-50 dark:bg-green-500 dark:text-green-950 dark:hover:bg-green-400"
            >
              {busy ? "Sending…" : "Send sign-in code"}
            </button>
            <button
              type="button"
              onClick={() => { if (email) { setError(null); setOtpStep("code"); } }}
              className="w-full text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
            >
              I already have a code
            </button>
          </form>
        )}

        {mode === "otp" && otpStep === "code" && (
          <form onSubmit={verifyCode} className="mt-5 space-y-4">
            <p className="text-sm text-stone-600 dark:text-stone-400">
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
              className="min-h-12 w-full rounded-full bg-green-700 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-green-800/15 hover:bg-green-800 disabled:opacity-50 dark:bg-green-500 dark:text-green-950 dark:hover:bg-green-400"
            >
              {busy ? "Verifying…" : "Sign in"}
            </button>
            <button type="button" onClick={() => setOtpStep("email")} className="w-full text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200">
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
              className="min-h-12 w-full rounded-full bg-green-700 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-green-800/15 hover:bg-green-800 disabled:opacity-50 dark:bg-green-500 dark:text-green-950 dark:hover:bg-green-400"
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
