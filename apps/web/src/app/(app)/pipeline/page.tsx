"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PIPELINE_STAGES, type PipelineStage } from "@raisely/shared-types";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { Badge } from "@/components/ui/badge";
import type { LeadListItem } from "@/lib/types";

const TIER_VARIANT = { A: "success", B: "warning", C: "secondary" } as const;

const STAGE_LABEL: Record<PipelineStage, string> = {
  IDENTIFIED: "Identified",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  MEETING: "Meeting",
  DILIGENCE: "Diligence",
  TERM_SHEET: "Term sheet",
  PASSED: "Passed",
};

function LeadCard({ lead, onDragStart }: { lead: LeadListItem; onDragStart: (id: string) => void }) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead.id)}
      className="cursor-grab space-y-1 rounded-md border bg-card p-3 text-sm shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{lead.investor.name}</span>
        {lead.tier && <Badge variant={TIER_VARIANT[lead.tier]}>{lead.tier}</Badge>}
      </div>
      <div className="text-xs text-muted-foreground">{lead.searchName ?? "Untitled search"}</div>
      {lead.fitScore !== null && <div className="text-xs text-muted-foreground">Fit score: {lead.fitScore}</div>}
    </div>
  );
}

export default function PipelinePage() {
  const { currentWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const queryKey = ["leads", currentWorkspaceId];
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const { data: leads, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.listLeads(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, pipelineStage }: { id: string; pipelineStage: PipelineStage }) =>
      api.patchLead(id, { pipelineStage }),
    onMutate: async ({ id, pipelineStage }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<LeadListItem[]>(queryKey);
      queryClient.setQueryData<LeadListItem[]>(queryKey, (old) =>
        old?.map((l) => (l.id === id ? { ...l, pipelineStage } : l))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
      <div className="grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = leads?.filter((l) => l.pipelineStage === stage) ?? [];
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggingId) patchMutation.mutate({ id: draggingId, pipelineStage: stage });
                setDraggingId(null);
              }}
              className="flex max-h-[75vh] min-h-[200px] flex-col rounded-lg border bg-muted/30 p-2"
            >
              <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase text-muted-foreground">
                {STAGE_LABEL[stage]}
                <span>{stageLeads.length}</span>
              </h2>
              <div className="space-y-2 overflow-y-auto">
                {stageLeads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} onDragStart={setDraggingId} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
