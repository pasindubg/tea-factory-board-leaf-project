import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { CollectorRow, LinkedSupplier, Profile } from "./types";

type SessionState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  supplier: LinkedSupplier | null;
  collector: CollectorRow | null;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionState | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [supplier, setSupplier] = useState<LinkedSupplier | null>(null);
  const [collector, setCollector] = useState<CollectorRow | null>(null);

  async function loadProfile(userId: string) {
    // Bootstrap exception: the authenticated auth user ID is the authority for
    // resolving its own profile; factory_id is not known until this row loads.
    const { data: prof } = await supabase
      .from("users")
      .select("id, name, role, factory_id, supplier_id")
      .eq("id", userId)
      .single();
    const profileRow = (prof as Profile) ?? null;
    setProfile(profileRow);

    // The supplier this login represents (supplier-role users), for their
    // requests/acknowledgements.
    if (profileRow?.supplier_id) {
      const { data: sup } = await supabase
        .from("suppliers")
        .select("id, name, area")
        .eq("id", profileRow.supplier_id)
        .eq("factory_id", profileRow.factory_id)
        .maybeSingle();
      setSupplier((sup as LinkedSupplier) ?? null);
    } else {
      setSupplier(null);
    }

    // Legacy collector link (parked collector screens attribute weighings to it).
    const { data: col } = await supabase
      .from("collectors")
      .select("id, name, area")
      .eq("user_id", userId)
      .eq("factory_id", profileRow.factory_id)
      .maybeSingle();
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
        setSupplier(null);
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
    <SessionContext.Provider value={{ loading, session, profile, supplier, collector, signOut, reloadProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
