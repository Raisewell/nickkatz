"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Trash2 } from "lucide-react";
import { Protected } from "@/components/protected";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteSearch, listSearches, type SearchListItem } from "@/lib/api";
import { useSession } from "@/lib/session";

function SavedSearchesList() {
  const { session } = useSession();
  const [searches, setSearches] = useState<SearchListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listSearches({ workspaceId: session.workspaceId, userId: session.userId, saved: true })
      .then(setSearches)
      .catch(() => setError("Couldn't load your saved searches."));
  }, [session]);

  async function handleDelete(id: string) {
    if (!session || !searches) return;
    const previous = searches;
    setSearches(searches.filter((s) => s.id !== id));
    try {
      await deleteSearch(id, { workspaceId: session.workspaceId, userId: session.userId });
    } catch {
      setSearches(previous);
      setError("Couldn't delete that search - try again.");
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!searches) return <p className="text-sm text-muted-foreground">Loading...</p>;

  if (searches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        <Bookmark className="mx-auto mb-2 h-5 w-5" />
        No saved searches yet. Run a search and hit &quot;Save this search&quot; to keep it here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {searches.map((s) => (
        <Card key={s.id}>
          <CardContent className="flex items-center justify-between p-4">
            <Link href={`/saved-searches/${s.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.name ?? s.queryText ?? "Untitled search"}</p>
              <p className="text-xs text-muted-foreground">
                {s.leadCount} match{s.leadCount === 1 ? "" : "es"} - {new Date(s.createdAt).toLocaleDateString()}
              </p>
            </Link>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} aria-label="Delete search">
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function SavedSearchesPage() {
  return (
    <Protected>
      <h1 className="text-xl font-semibold">Saved searches</h1>
      <p className="mt-1 text-sm text-muted-foreground">Searches you&apos;ve bookmarked for later.</p>
      <div className="mt-6">
        <SavedSearchesList />
      </div>
    </Protected>
  );
}
