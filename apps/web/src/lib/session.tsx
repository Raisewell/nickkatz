"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  SessionProvider as NextAuthSessionProvider,
  useSession as useNextAuthSession,
  signOut as nextAuthSignOut,
} from "next-auth/react";
import { listWorkspaces, createWorkspace, type Workspace } from "./api";

const WORKSPACE_STORAGE_KEY = "raisely.activeWorkspaceId";

export interface ActiveSession {
  userId: string;
  email: string;
  name: string | null;
  workspaceId: string;
  workspaceName: string;
  companyOneLiner: string | null;
}

interface SessionContextValue {
  session: ActiveSession | null;
  loading: boolean;
  /** True once we know the signed-in user is authenticated but owns/belongs to no workspace yet. */
  needsWorkspace: boolean;
  workspaces: Workspace[];
  createFirstWorkspace: (input: { companyOneLiner?: string }) => Promise<void>;
  switchWorkspace: (workspaceId: string) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function SessionBridge({ children }: { children: ReactNode }) {
  const { data: authSession, status } = useNextAuthSession();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refreshWorkspaces = useCallback(async () => {
    const list = await listWorkspaces();
    setWorkspaces(list);
    setWorkspacesLoaded(true);
    return list;
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    refreshWorkspaces().catch(() => setWorkspacesLoaded(true));
  }, [status, refreshWorkspaces]);

  useEffect(() => {
    if (activeWorkspaceId || workspaces.length === 0) return;
    const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    const initial = workspaces.find((w) => w.id === stored)?.id ?? workspaces[0].id;
    setActiveWorkspaceIdState(initial);
  }, [workspaces, activeWorkspaceId]);

  const switchWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspaceIdState(workspaceId);
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
  }, []);

  const createFirstWorkspace = useCallback(
    async (input: { companyOneLiner?: string }) => {
      setCreating(true);
      try {
        const workspace = await createWorkspace(input);
        await refreshWorkspaces();
        switchWorkspace(workspace.id);
      } finally {
        setCreating(false);
      }
    },
    [refreshWorkspaces, switchWorkspace]
  );

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  const loading = status === "loading" || (status === "authenticated" && !workspacesLoaded) || creating;

  const session: ActiveSession | null =
    status === "authenticated" && authSession?.user?.id && activeWorkspace
      ? {
          userId: authSession.user.id,
          email: authSession.user.email ?? "",
          name: authSession.user.name ?? null,
          workspaceId: activeWorkspace.id,
          workspaceName: activeWorkspace.name,
          companyOneLiner: activeWorkspace.companyOneLiner,
        }
      : null;

  const needsWorkspace = status === "authenticated" && workspacesLoaded && workspaces.length === 0 && !creating;

  return (
    <SessionContext.Provider
      value={{
        session,
        loading,
        needsWorkspace,
        workspaces,
        createFirstWorkspace,
        switchWorkspace,
        signOut: () => {
          window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
          void nextAuthSignOut({ callbackUrl: "/sign-in" });
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <SessionBridge>{children}</SessionBridge>
    </NextAuthSessionProvider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
