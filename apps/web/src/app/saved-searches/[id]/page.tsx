"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Protected } from "@/components/protected";
import { Button } from "@/components/ui/button";
import { LeadCard } from "@/components/lead-card";
import { getSearch, rerunSearch, type Lead, type SearchSummary } from "@/lib/api";
import { useSession } from "@/lib/session";

function SearchDetail({ id }: { id: string }) {
  const { session } = useSession();
  const router = useRouter();
  const [search, setSearch] = useState<SearchSummary | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

  useEffect(() => {
    if (!session) return;
    getSearch(id, { workspaceId: session.workspaceId, userId: session.userId })
      .then((result) => {
        setSearch(result.search);
        setLeads([...result.leads].sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)));
      })
      .catch(() => setError("Couldn't load this search."));
  }, [session, id]);

  async function handleRerun() {
    if (!session) return;
    setRerunning(true);
    try {
      const result = await rerunSearch(id, { workspaceId: session.workspaceId, createdById: session.userId });
      router.push(`/saved-searches/${result.search.id}`);
    } catch {
      setError("Couldn't re-run this search - try again.");
      setRerunning(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!search || !leads) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{search.name ?? search.queryText ?? "Untitled search"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {leads.length} match{leads.length === 1 ? "" : "es"} - run on {new Date(search.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRerun} disabled={rerunning} className="gap-1.5">
          {rerunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Re-run with fresh data
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}

export default function SavedSearchDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <Protected>
      <SearchDetail id={params.id} />
    </Protected>
  );
}
