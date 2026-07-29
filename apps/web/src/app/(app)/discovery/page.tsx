"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewDiscoveryForm } from "./new-discovery-form";
import { DiscoveryRunPanel } from "./discovery-run-panel";

export default function DiscoveryPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data: runs, isLoading } = useQuery({
    queryKey: ["discovery-runs", currentWorkspaceId],
    queryFn: () => api.listDiscoveryRuns(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const activeRunId = selectedRunId ?? runs?.[0]?.id ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Discovery</h1>
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {runs && runs.length === 0 && (
          <p className="text-sm text-muted-foreground">No discovery runs yet - start one to the right.</p>
        )}
        {runs?.map((run) => (
          <Card
            key={run.id}
            className={`cursor-pointer ${run.id === activeRunId ? "border-primary" : ""}`}
            onClick={() => setSelectedRunId(run.id)}
          >
            <CardHeader className="flex-row items-center justify-between space-y-0 py-4">
              <CardTitle className="text-sm font-medium">{run.comparableCompanies.join(", ")}</CardTitle>
              <Badge>{run.status}</Badge>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="space-y-4">
        <NewDiscoveryForm onCreated={setSelectedRunId} />
        {activeRunId && <DiscoveryRunPanel key={activeRunId} runId={activeRunId} />}
      </div>
    </div>
  );
}
