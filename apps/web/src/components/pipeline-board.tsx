"use client";

import { useEffect, useState } from "react";
import { PIPELINE_STAGES, type PipelineStage } from "@raisely/shared-types";
import { Flame, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { FitScoreBadge, TierBadge } from "@/components/fit-score";
import { computeWarmPaths, listPipelineLeads, listWarmPaths, updatePipelineStage, type PipelineLead, type WarmPath } from "@/lib/api";
import { useSession } from "@/lib/session";

const STAGE_LABELS: Record<PipelineStage, string> = {
  IDENTIFIED: "Identified",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  MEETING: "Meeting",
  DILIGENCE: "Diligence",
  TERM_SHEET: "Term sheet",
  PASSED: "Passed",
};

function WarmPathFinder({ leadId }: { leadId: string }) {
  const { session } = useSession();
  const [paths, setPaths] = useState<WarmPath[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFind() {
    if (!session) return;
    setLoading(true);
    try {
      await computeWarmPaths({ workspaceId: session.workspaceId, userId: session.userId, leadId });
      const found = await listWarmPaths({ workspaceId: session.workspaceId, userId: session.userId, leadId });
      setPaths(found);
    } finally {
      setLoading(false);
    }
  }

  if (paths) {
    return paths.length === 0 ? (
      <p className="mt-1 text-[11px] text-muted-foreground">No warm paths found against your imported network.</p>
    ) : (
      <div className="mt-1 space-y-1">
        {paths.map((p) => (
          <div key={p.id} className="flex items-center gap-1 text-[11px] text-emerald-700">
            <Flame className="h-3 w-3" />
            {p.mutualName ?? "Direct connection"}
            {p.strengthScore !== null && ` (${p.strengthScore})`}
          </div>
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={handleFind}
      disabled={loading}
      className="mt-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flame className="h-3 w-3" />}
      Find warm intros
    </button>
  );
}

function PipelineCard({ lead, onMove }: { lead: PipelineLead; onMove: (leadId: string, stage: PipelineStage) => void }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <FitScoreBadge score={lead.fitScore} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold">{lead.investor.name}</p>
              <TierBadge tier={lead.tier} />
            </div>
            <p className="text-[11px] uppercase text-muted-foreground">{lead.investor.type.replace("_", " ")}</p>
          </div>
        </div>

        {lead.bestWarmPath ? (
          <div className="flex items-center gap-1 text-[11px] text-emerald-700">
            <Flame className="h-3 w-3" />
            Warm path{lead.bestWarmPath.mutualName ? ` - ${lead.bestWarmPath.mutualName}` : ""}
          </div>
        ) : (
          <WarmPathFinder leadId={lead.id} />
        )}

        <select
          value={lead.pipelineStage}
          onChange={(e) => onMove(lead.id, e.target.value as PipelineStage)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </CardContent>
    </Card>
  );
}

export function PipelineBoard() {
  const { session } = useSession();
  const [leads, setLeads] = useState<PipelineLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listPipelineLeads({ workspaceId: session.workspaceId, userId: session.userId })
      .then(setLeads)
      .catch(() => setError("Couldn't load your pipeline."));
  }, [session]);

  async function handleMove(leadId: string, pipelineStage: PipelineStage) {
    if (!session || !leads) return;
    const previous = leads;
    setLeads(leads.map((l) => (l.id === leadId ? { ...l, pipelineStage } : l)));
    try {
      await updatePipelineStage(leadId, { workspaceId: session.workspaceId, userId: session.userId, pipelineStage });
    } catch {
      setLeads(previous);
      setError("Couldn't move that lead - try again.");
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!leads) return <p className="text-sm text-muted-foreground">Loading your pipeline...</p>;

  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No leads yet. Run a search first, and the investors you find will show up here to move through your pipeline.
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PIPELINE_STAGES.map((stage) => {
        const stageLeads = leads.filter((l) => l.pipelineStage === stage);
        return (
          <div key={stage} className="flex max-h-[calc(100vh-14rem)] w-64 flex-none flex-col">
            <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-muted-foreground">
              {STAGE_LABELS[stage]}
              <span className="rounded-full bg-muted px-1.5 text-xs">{stageLeads.length}</span>
            </h3>
            {/* Capped at 200 leads server-side (see GET /leads), but even 200 in one column
                with no scroll bound would still push the whole page out to several thousand
                px tall - independent per-column scroll keeps it a fixed-height board. */}
            <div className="space-y-2 overflow-y-auto">
              {stageLeads.map((lead) => (
                <PipelineCard key={lead.id} lead={lead} onMove={handleMove} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
