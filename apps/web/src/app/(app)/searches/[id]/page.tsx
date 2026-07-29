"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LeadRow } from "@/components/lead-row";

export default function SearchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const queryKey = ["search", id];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => api.getSearch(id),
  });

  const tierMutation = useMutation({
    mutationFn: () => api.tierSearch(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (isError || !data) return <p className="text-sm text-destructive">Search not found.</p>;

  const { search, leads } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{search.name ?? search.queryText ?? "Untitled search"}</h1>
          {search.queryText && <p className="mt-1 text-sm text-muted-foreground">&ldquo;{search.queryText}&rdquo;</p>}
          <div className="mt-2 flex items-center gap-2">
            <Badge>{search.status}</Badge>
            <span className="text-xs text-muted-foreground">
              {leads.length} leads{search.excludedCount > 0 ? ` - ${search.excludedCount} excluded` : ""}
            </span>
          </div>
        </div>
        <Button size="sm" variant="secondary" disabled={tierMutation.isPending} onClick={() => tierMutation.mutate()}>
          {tierMutation.isPending ? "Tiering..." : "Auto-tier leads"}
        </Button>
      </div>

      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leads matched this search.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Investor</th>
                <th className="px-4 py-2 font-medium">Fit score</th>
                <th className="px-4 py-2 font-medium">Tier</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Outreach</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <LeadRow key={lead.id} lead={lead} invalidateKey={queryKey} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
