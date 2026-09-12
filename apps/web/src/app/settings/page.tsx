"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Protected } from "@/components/protected";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  addWorkspaceMember,
  deleteWorkspaceRequest,
  exportWorkspaceData,
  listWorkspaceMembers,
  removeWorkspaceMember,
  type WorkspaceMember,
} from "@/lib/api";
import { useSession } from "@/lib/session";

function useIsOwner() {
  const { session, workspaces } = useSession();
  const currentWorkspace = workspaces.find((w) => w.id === session?.workspaceId);
  return !!session && currentWorkspace?.ownerId === session.userId;
}

function TeamSettings() {
  const { session } = useSession();
  const isOwner = useIsOwner();
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!session) return;
    listWorkspaceMembers(session.workspaceId)
      .then(setMembers)
      .catch(() => setError("Couldn't load the team list."));
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    setInviting(true);
    try {
      await addWorkspaceMember(session.workspaceId, { email: email.trim() });
      setEmail("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that person.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!session) return;
    setError(null);
    try {
      await removeWorkspaceMember(session.workspaceId, userId);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove that person.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!members && <p className="text-sm text-muted-foreground">Loading team...</p>}

        {members && (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.name ?? m.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email} · {m.role.toLowerCase()}
                  </p>
                </div>
                {isOwner && m.role !== "OWNER" && (
                  <Button variant="ghost" size="sm" className="shrink-0" onClick={() => handleRemove(m.userId)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {isOwner ? (
          <form onSubmit={handleInvite} className="flex gap-2">
            <Input
              type="email"
              required
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" disabled={inviting} className="shrink-0">
              {inviting ? "Adding..." : "Add"}
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">Only the workspace owner can add or remove teammates.</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground">
          They need a Raisely account already - ask them to sign in once first, then add them here by email.
        </p>
      </CardContent>
    </Card>
  );
}

function DataSettings() {
  const { session } = useSession();
  const isOwner = useIsOwner();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    if (!session) return;
    setError(null);
    setExporting(true);
    try {
      const data = await exportWorkspaceData(session.workspaceId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `raisely-export-${session.workspaceId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't export your data. Try again in a moment.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!session) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteWorkspaceRequest(session.workspaceId);
      router.push("/");
      window.location.reload();
    } catch {
      setError("Couldn't delete this workspace. Try again in a moment.");
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium">Export everything</p>
          <p className="text-xs text-muted-foreground">Download all data this workspace owns as a JSON file.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Export data"}
          </Button>
        </div>

        {isOwner && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-destructive">Delete this workspace</p>
            <p className="text-xs text-muted-foreground">
              Permanently deletes this workspace and everything in it. This can&apos;t be undone.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Type "delete" to confirm'
                className="max-w-xs"
              />
              <Button
                variant="destructive"
                size="sm"
                disabled={confirmText.toLowerCase() !== "delete" || deleting}
                onClick={handleDelete}
              >
                {deleting ? "Deleting..." : "Delete workspace"}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <Protected>
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage your team and your workspace&apos;s data.</p>
      <div className="mt-6 space-y-6">
        <TeamSettings />
        <DataSettings />
      </div>
    </Protected>
  );
}
