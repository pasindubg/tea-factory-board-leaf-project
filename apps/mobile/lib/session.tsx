import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { CollectorRow, Profile } from "./types";

type SessionState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  collector: CollectorRow | null;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionState | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [collector, setCollector] = useState<CollectorRow | null>(null);

  async function loadProfile(userId: string) {
    // The collector's factory + role, and their collector row (weighings are
    // recorded against collector_id). RLS scopes both to this user's factory.
    const [{ data: prof }, { data: col }] = await Promise.all([
      supabase.from("users").select("id, name, role, factory_id").eq("id", userId).single(),
      supabase.from("collectors").select("id, name, area").eq("user_id", userId).maybeSingle(),
    ]);
    setProfile((prof as Profile) ?? null);
    setCollector((col as CollectorRow) ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next) {
        await loadProfile(next.user.id);
      } else {
        setProfile(null);
        setCollector(null);
      }
    });

    // Supabase RN guidance: only auto-refresh tokens while the app is foreground.
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      sub.subscription.unsubscribe();
      appState.remove();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function reloadProfile() {
    if (session) await loadProfile(session.user.id);
  }

  return (
    <SessionContext.Provider value={{ loading, session, profile, collector, signOut, reloadProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
