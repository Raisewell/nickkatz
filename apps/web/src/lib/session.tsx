"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createDevSession, type DevSession } from "./api";

const STORAGE_KEY = "raisely.session";

interface SessionContextValue {
  session: DevSession | null;
  loading: boolean;
  signIn: (input: { email: string; workspaceName?: string; companyOneLiner?: string }) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DevSession | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setSession(JSON.parse(raw));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const signIn = useCallback(
    async (input: { email: string; workspaceName?: string; companyOneLiner?: string }) => {
      setLoading(true);
      try {
        const next = await createDevSession(input);
        setSession(next);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const signOut = useCallback(() => {
    setSession(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  return <SessionContext.Provider value={{ session, loading, signIn, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
