"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const errorMessages: Record<string, string> = {
    deactivated: "Your account has been deactivated. Contact your factory owner.",
    no_profile: "Your login isn't linked to any factory. Contact your factory owner.",
  };
  const errorParam = searchParams.get("error");
  const [error, setError] = useState<string | null>(errorParam ? (errorMessages[errorParam] ?? null) : null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Tea Factory Ops</h1>
        <p className="mt-1 text-sm text-stone-500">Sign in to your factory dashboard</p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {step === "email" ? (
          <form onSubmit={sendCode} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@factory.lk"
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none"
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
              onClick={() => {
                if (email) {
                  setError(null);
                  setStep("code");
                }
              }}
              className="w-full text-sm text-stone-500 hover:text-stone-700"
            >
              I already have a code
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 space-y-4">
            <p className="text-sm text-stone-600">
              We sent a sign-in email to <span className="font-medium">{email}</span>. Enter the code, or
              click the link in the email.
            </p>
            <label className="block text-sm font-medium">
              Code
              <input
                inputMode="numeric"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm tracking-widest focus:border-green-600 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Sign in"}
            </button>
            <button type="button" onClick={() => setStep("email")} className="w-full text-sm text-stone-500 hover:text-stone-700">
              Use a different email
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
