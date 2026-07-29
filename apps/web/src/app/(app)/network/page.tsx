"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ImportContactsCard() {
  const { currentWorkspaceId } = useWorkspace();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: (file: File) => {
      if (!currentWorkspaceId) throw new Error("No workspace selected");
      return api.importNetworkContacts(currentWorkspaceId, file);
    },
    onSuccess: (res) => {
      setResult(`Imported ${res.contactsCreated} contacts from ${res.rowsParsed} rows (${res.detectedFormat}).`);
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err: Error) => setResult(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your network</CardTitle>
        <CardDescription>
          Import your LinkedIn connections (Connections.csv export) or a generic contacts CSV to power warm-path
          matching on leads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importMutation.mutate(file);
          }}
          className="text-sm"
        />
        {importMutation.isPending && <p className="text-sm text-muted-foreground">Importing...</p>}
        {result && <p className="text-sm text-muted-foreground">{result}</p>}
      </CardContent>
    </Card>
  );
}

function ExclusionListsCard() {
  const { currentWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [newListName, setNewListName] = useState("");
  const [uploadResult, setUploadResult] = useState<Record<string, string>>({});

  const { data: lists, isLoading } = useQuery({
    queryKey: ["exclusion-lists", currentWorkspaceId],
    queryFn: () => api.listExclusionLists(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!currentWorkspaceId) throw new Error("No workspace selected");
      return api.createExclusionList(currentWorkspaceId, newListName);
    },
    onSuccess: () => {
      setNewListName("");
      queryClient.invalidateQueries({ queryKey: ["exclusion-lists", currentWorkspaceId] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => api.uploadExclusionListFile(id, file),
    onSuccess: (res, { id }) => {
      setUploadResult((r) => ({ ...r, [id]: `+${res.entriesCreated} entries (${res.detectedFormat})` }));
      queryClient.invalidateQueries({ queryKey: ["exclusion-lists", currentWorkspaceId] });
    },
    onError: (err: Error, { id }) => setUploadResult((r) => ({ ...r, [id]: err.message })),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteExclusionList(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exclusion-lists", currentWorkspaceId] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exclusion lists</CardTitle>
        <CardDescription>
          Investors and contacts on these lists (e.g. people you already know, or firms to avoid) are hidden
          from every search&apos;s results.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="List name (e.g. LinkedIn connections)"
          />
          <Button
            disabled={!newListName || !currentWorkspaceId || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create
          </Button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {lists && lists.length === 0 && <p className="text-sm text-muted-foreground">No exclusion lists yet.</p>}

        <div className="space-y-2">
          {lists?.map((list) => (
            <div key={list.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">{list.name}</div>
                <div className="text-xs text-muted-foreground">
                  {list.entryCount} entries
                  {uploadResult[list.id] ? ` - ${uploadResult[list.id]}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".csv"
                  className="w-40 text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadMutation.mutate({ id: list.id, file });
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Delete "${list.name}"?`)) deleteMutation.mutate(list.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function NetworkPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Network</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <ImportContactsCard />
        <ExclusionListsCard />
      </div>
    </div>
  );
}
