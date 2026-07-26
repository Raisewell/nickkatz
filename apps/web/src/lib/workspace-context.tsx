"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Workspace, WorkspaceMember } from "./types";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  isLoading: boolean;
  currentWorkspace: Workspace | null;
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (id: string) => void;
  currentUser: WorkspaceMember["user"] | null;
  currentUserId: string | null;
  setCurrentUserId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const WORKSPACE_KEY = "raisely:workspaceId";
const USER_KEY = "raisely:userId";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: api.listWorkspaces,
    staleTime: 60_000,
  });

  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState<string | null>(null);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(null);

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

  useEffect(() => {
    if (!currentWorkspace) return;
    if (currentUserId && currentWorkspace.members.some((m) => m.user.id === currentUserId)) return;
    const stored = localStorage.getItem(USER_KEY);
    const initial =
      currentWorkspace.members.find((m) => m.user.id === stored)?.user.id ??
      currentWorkspace.members[0]?.user.id ??
      null;
    setCurrentUserIdState(initial);
  }, [currentWorkspace, currentUserId]);

  const setCurrentWorkspaceId = (id: string) => {
    setCurrentWorkspaceIdState(id);
    localStorage.setItem(WORKSPACE_KEY, id);
    setCurrentUserIdState(null);
  };

  const setCurrentUserId = (id: string) => {
    setCurrentUserIdState(id);
    localStorage.setItem(USER_KEY, id);
  };

  const currentUser = useMemo(
    () => currentWorkspace?.members.find((m) => m.user.id === currentUserId)?.user ?? null,
    [currentWorkspace, currentUserId]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        isLoading,
        currentWorkspace,
        currentWorkspaceId,
        setCurrentWorkspaceId,
        currentUser,
        currentUserId,
        setCurrentUserId,
      }}
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
