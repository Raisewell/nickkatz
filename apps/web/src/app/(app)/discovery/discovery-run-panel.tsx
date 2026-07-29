"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ACTIVE_STATUSES = ["QUEUED", "RUNNING", "APPROVED"];

export function DiscoveryRunPanel({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const { currentWorkspaceId } = useWorkspace();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: run, isLoading } = useQuery({
    queryKey: ["discovery-run", runId],
    queryFn: () => api.getDiscoveryRun(runId),
    refetchInterval: (query) => (query.state.data && ACTIVE_STATUSES.includes(query.state.data.status) ? 2000 : false),
  });

  const approveMutation = useMutation({
    mutationFn: () => api.approveDiscoveryRun(runId, Array.from(selected)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discovery-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["discovery-runs", currentWorkspaceId] });
    },
  });

  if (isLoading || !run) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{run.comparableCompanies.join(", ")}</CardTitle>
          <Badge>{run.status}</Badge>
        </div>
        <CardDescription>Started {new Date(run.createdAt).toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(run.status === "QUEUED" || run.status === "RUNNING") && (
          <p className="text-sm text-muted-foreground">Matching investors against the co-investment graph...</p>
        )}

        {run.status === "FAILED" && <p className="text-sm text-destructive">{run.error ?? "Discovery run failed."}</p>}

        {run.previewResults && (run.status === "AWAITING_APPROVAL" || run.status === "APPROVED") && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Inferred sectors: {run.previewResults.inferredSectors.join(", ") || "none"}
            </p>
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {run.previewResults.candidates.map((c) => (
                <label
                  key={c.investorId}
                  className="flex items-start gap-2 rounded-md border p-2 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={run.status !== "AWAITING_APPROVAL"}
                    checked={selected.has(c.investorId)}
                    onChange={() => toggle(c.investorId)}
                  />
                  <span>
                    <span className="font-medium">{c.investorName}</span>{" "}
                    <Badge variant={c.matchType === "direct" ? "success" : "secondary"} className="text-[10px]">
                      {c.matchType === "direct" ? "direct match" : "co-investor"}
                    </Badge>{" "}
                    <span className="text-xs text-muted-foreground">(score {c.score})</span>
                    <div className="text-xs text-muted-foreground">{c.reason}</div>
                  </span>
                </label>
              ))}
            </div>
            {run.status === "AWAITING_APPROVAL" && (
              <Button disabled={selected.size === 0 || approveMutation.isPending} onClick={() => approveMutation.mutate()}>
                {approveMutation.isPending ? "Approving..." : `Approve ${selected.size || ""} and build search`}
              </Button>
            )}
          </div>
        )}

        {run.status === "COMPLETE" && run.resultSearchId && (
          <Button asChild>
            <Link href={`/searches/${run.resultSearchId}`}>View resulting search</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
