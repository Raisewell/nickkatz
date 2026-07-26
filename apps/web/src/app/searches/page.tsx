"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewSearchForm } from "./new-search-form";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success"> = {
  COMPLETE: "success",
  RUNNING: "secondary",
  QUEUED: "secondary",
  FAILED: "destructive",
  DRAFT: "default",
};

export default function SearchesPage() {
  const { currentWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const { data: searches, isLoading } = useQuery({
    queryKey: ["searches", currentWorkspaceId],
    queryFn: () => api.listSearches(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSearch(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["searches", currentWorkspaceId] }),
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Searches</h1>
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {searches && searches.length === 0 && (
          <p className="text-sm text-muted-foreground">No searches yet - create one to the right.</p>
        )}
        {searches?.map((search) => (
          <Card key={search.id}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">
                  <Link href={`/searches/${search.id}`} className="hover:underline">
                    {search.name ?? search.queryText ?? "Untitled search"}
                  </Link>
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(search.createdAt).toLocaleDateString()} - {search.leadCount} leads
                  {search.excludedCount > 0 ? ` - ${search.excludedCount} excluded` : ""}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[search.status] ?? "default"}>{search.status}</Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between pt-0">
              <Button size="sm" variant="outline" asChild>
                <Link href={`/searches/${search.id}`}>View leads</Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (confirm("Delete this search and its leads?")) deleteMutation.mutate(search.id);
                }}
              >
                Delete
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <NewSearchForm />
    </div>
  );
}
