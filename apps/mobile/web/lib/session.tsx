import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getSession, onAuthStateChange, signOut, type AuthSession } from "./auth";
import { mobileRequest } from "./api";
import type { CollectorRow, LinkedSupplier, Profile } from "./types";

type ProfileData = { profile: Profile; supplier: LinkedSupplier | null; collector: CollectorRow | null };
type State = Partial<ProfileData> & { session?: AuthSession; error?: string };
const SessionContext = createContext<(State & {
  loading: boolean;
  signOut: typeof signOut;
  reloadProfile: () => Promise<void>;
}) | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({});
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const load = useCallback(async (current: AuthSession | null) => {
    const run = ++generation.current;
    if (!current) { setState({}); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await mobileRequest<ProfileData>("/api/mobile/bootstrap", {});
      if (data.profile.id !== current.user.id) throw new Error("Your session could not be verified. Sign in again.");
      if (run !== generation.current) return;
      setState({ ...data, session: current });
    } catch (error) {
      if (run === generation.current) setState({ session: current, error: error instanceof Error ? error.message : "Could not load your profile." });
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, []);

  const reloadProfile = useCallback(async () => {
    try { await load(await getSession()); }
    catch (error) {
      setState({ error: error instanceof Error ? error.message : "Could not restore your session." });
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((session) => { void load(session); });
    void reloadProfile();
    return () => { generation.current++; unsubscribe(); };
  }, [load, reloadProfile]);

  return <SessionContext.Provider value={{ ...state, loading, signOut, reloadProfile }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("Session provider is missing.");
  return ctx;
}
