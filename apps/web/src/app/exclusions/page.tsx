"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, ShieldOff, Trash2, Upload } from "lucide-react";
import { Protected } from "@/components/protected";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createExclusionList,
  deleteExclusionList,
  listExclusionLists,
  uploadExclusionCsv,
  type ExclusionListSummary,
} from "@/lib/api";
import { useSession } from "@/lib/session";

function ExclusionLists() {
  const { session } = useSession();
  const [lists, setLists] = useState<ExclusionListSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  function reload() {
    if (!session) return;
    listExclusionLists({ workspaceId: session.workspaceId, userId: session.userId })
      .then(setLists)
      .catch(() => setError("Couldn't load your exclusion lists."));
  }

  useEffect(reload, [session]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!session || !name.trim()) return;
    setCreating(true);
    try {
      await createExclusionList({ workspaceId: session.workspaceId, userId: session.userId, name: name.trim() });
      setName("");
      reload();
    } catch {
      setError("Couldn't create that list - try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpload(listId: string, file: File) {
    if (!session) return;
    setUploadingId(listId);
    try {
      await uploadExclusionCsv(listId, { workspaceId: session.workspaceId, userId: session.userId }, file);
      reload();
    } catch {
      setError("Couldn't upload that file - make sure it's a CSV.");
    } finally {
      setUploadingId(null);
    }
  }

  async function handleDelete(listId: string) {
    if (!session || !lists) return;
    const previous = lists;
    setLists(lists.filter((l) => l.id !== listId));
    try {
      await deleteExclusionList(listId, { workspaceId: session.workspaceId, userId: session.userId });
    } catch {
      setLists(previous);
      setError("Couldn't delete that list - try again.");
    }
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. LinkedIn connections, portfolio conflicts" />
        <Button type="submit" disabled={creating || !name.trim()} className="shrink-0 gap-1.5">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          New list
        </Button>
      </form>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-6 space-y-2">
        {!lists && <p className="text-sm text-muted-foreground">Loading...</p>}

        {lists?.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            <ShieldOff className="mx-auto mb-2 h-5 w-5" />
            No exclusion lists yet. Create one, then upload a CSV of people or firms you never want to see in results.
          </div>
        )}

        {lists?.map((list) => (
          <Card key={list.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{list.name}</p>
                <p className="text-xs text-muted-foreground">
                  {list.entryCount} entr{list.entryCount === 1 ? "y" : "ies"} - created{" "}
                  {new Date(list.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  ref={(el) => {
                    fileInputs.current[list.id] = el;
                  }}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(list.id, file);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={uploadingId === list.id}
                  onClick={() => fileInputs.current[list.id]?.click()}
                >
                  {uploadingId === list.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Upload CSV
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(list.id)} aria-label="Delete list">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function ExclusionsPage() {
  return (
    <Protected>
      <h1 className="text-xl font-semibold">Exclusion lists</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        People and firms to filter out of every search - LinkedIn connections, portfolio conflicts, anyone you don&apos;t
        want to see.
      </p>
      <div className="mt-6">
        <ExclusionLists />
      </div>
    </Protected>
  );
}
