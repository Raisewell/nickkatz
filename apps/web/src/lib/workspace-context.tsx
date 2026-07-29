"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Workspace } from "./types";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  isLoading: boolean;
  currentWorkspace: Workspace | null;
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const WORKSPACE_KEY = "raisely:workspaceId";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: api.listWorkspaces,
    staleTime: 60_000,
    enabled: status === "authenticated",
  });

  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState<string | null>(null);

  useEffect(() => {
    if (currentWorkspaceId || workspaces.length === 0) return;
    const stored = localStorage.getItem(WORKSPACE_KEY);
    const initial = workspaces.find((w) => w.id === stored)?.id ?? workspaces[0].id;
    setCurrentWorkspaceIdState(initial);
  }, [workspaces, currentWorkspaceId]);

  const currentWorkspace = useMemo(
    () => workspaces.find((w) => w.id === currentWorkspaceId) ?? null,
    [workspaces, currentWorkspaceId]
  );

  const setCurrentWorkspaceId = (id: string) => {
    setCurrentWorkspaceIdState(id);
    localStorage.setItem(WORKSPACE_KEY, id);
  };

  return (
    <WorkspaceContext.Provider
      value={{ workspaces, isLoading, currentWorkspace, currentWorkspaceId, setCurrentWorkspaceId }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
