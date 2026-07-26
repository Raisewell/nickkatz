"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PIPELINE_STAGES, LEAD_TIERS } from "@raisely/shared-types";
import { api } from "@/lib/api";
import type { Lead } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FitScore } from "@/components/fit-score";
import { OutreachDraftModal } from "@/components/outreach-draft-modal";

const TIER_VARIANT = { A: "success", B: "warning", C: "secondary" } as const;

export function LeadRow({ lead, invalidateKey }: { lead: Lead; invalidateKey: unknown[] }) {
  const queryClient = useQueryClient();
  const [draftOpen, setDraftOpen] = useState(false);

  const patchMutation = useMutation({
    mutationFn: (body: Parameters<typeof api.patchLead>[1]) => api.patchLead(lead.id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invalidateKey }),
  });

  return (
    <tr className="border-b align-top last:border-0">
      <td className="max-w-xs px-4 py-3">
        <div className="font-medium">
          {lead.investor.website ? (
            <a href={lead.investor.website} target="_blank" rel="noreferrer" className="hover:underline">
              {lead.investor.name}
            </a>
          ) : (
            lead.investor.name
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {lead.investor.type} - {lead.investor.sectors.slice(0, 3).join(", ") || "no sectors listed"}
        </div>
        {lead.bestWarmPath && (
          <Badge variant="secondary" className="mt-1 text-[10px]">
            Warm path: {lead.bestWarmPath.mutualName ?? "via connection"}
            {lead.bestWarmPath.verified ? " (verified)" : ""}
          </Badge>
        )}
      </td>
      <td className="px-4 py-3">
        <FitScore fitScore={lead.fitScore} fitReasons={lead.fitReasons} />
      </td>
      <td className="px-4 py-3">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={lead.tier ?? ""}
          disabled={patchMutation.isPending}
          onChange={(e) => patchMutation.mutate({ tier: (e.target.value || undefined) as Lead["tier"] })}
        >
          <option value="">-</option>
          {LEAD_TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {lead.tier && (
          <Badge variant={TIER_VARIANT[lead.tier]} className="ml-2">
            {lead.tier}
          </Badge>
        )}
      </td>
      <td className="px-4 py-3">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={lead.pipelineStage}
          disabled={patchMutation.isPending}
          onChange={(e) => patchMutation.mutate({ pipelineStage: e.target.value as Lead["pipelineStage"] })}
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <Button size="sm" variant="outline" onClick={() => setDraftOpen(true)}>
          Outreach
        </Button>
        <OutreachDraftModal
          leadId={lead.id}
          investorName={lead.investor.name}
          open={draftOpen}
          onClose={() => setDraftOpen(false)}
        />
      </td>
    </tr>
  );
}
