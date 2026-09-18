import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSession, onAuthStateChange, signOut as endSession, type AuthSession } from "./auth";
import { supabase } from "./supabase";
import { bindThisDevice } from "./bind-device";
import type { CollectorRow, DeviceRegistration, LinkedSupplier, Profile } from "./types";

type SessionState = {
  loading: boolean;
  session: AuthSession | null;
  profile: Profile | null;
  supplier: LinkedSupplier | null;
  collector: CollectorRow | null;
  binding: DeviceRegistration | null;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionState | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [supplier, setSupplier] = useState<LinkedSupplier | null>(null);
  const [collector, setCollector] = useState<CollectorRow | null>(null);
  // null until the phone has been checked against the login's binding. The
  // login screen reads the verdict from here, so a rejection outlives the
  // screen being unmounted by a redirect.
  const [binding, setBinding] = useState<DeviceRegistration | null>(null);

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
    if (!profileRow) {
      setSupplier(null);
      setCollector(null);
      return;
    }

    // A field officer's login is tied to one handset. Check it here rather than
    // on the login screen: the redirect fires as soon as the profile lands, so
    // a verdict raised on that screen would be lost with it.
    setBinding(profileRow.role === "field_officer" ? await bindThisDevice() : "bound");

    // The supplier this login represents (supplier-role users), for their
    // requests/acknowledgements.
    if (profileRow.supplier_id) {
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
    getSession().then(async (current) => {
      setSession(current);
      if (current) await loadProfile(current.user.id);
      setLoading(false);
    });

    return onAuthStateChange(async (next) => {
      setSession(next);
      if (next) {
        setBinding(null);
        await loadProfile(next.user.id);
      } else {
        setProfile(null);
        setSupplier(null);
        setCollector(null);
      }
    });
  }, []);

  async function signOut() {
    await endSession();
  }

  async function reloadProfile() {
    if (session) await loadProfile(session.user.id);
  }

  return (
    <SessionContext.Provider value={{ loading, session, profile, supplier, collector, binding, signOut, reloadProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
