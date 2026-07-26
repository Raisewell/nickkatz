"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy, Flame, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FitScoreBadge, TierBadge } from "@/components/fit-score";
import { draftOutreach, type Lead, type OutreachDraft } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

function formatCheck(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  const fmt = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(n / 1000)}K`);
  if (min !== null && max !== null) return `${fmt(min)}-${fmt(max)}`;
  return fmt(min ?? max ?? 0);
}

export function LeadCard({ lead }: { lead: Lead }) {
  const { session } = useSession();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { investor } = lead;
  const checkRange = formatCheck(investor.checkMin, investor.checkMax);
  const hasWarmPath = Boolean(lead.bestWarmPath);

  async function handleDraft() {
    if (!session) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const result = await draftOutreach(lead.id, {
        workspaceId: session.workspaceId,
        userId: session.userId,
        companyOneLiner: session.companyOneLiner ?? undefined,
      });
      setDraft(result);
    } catch {
      setDraftError("Couldn't draft outreach right now - try again in a moment.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleCopy() {
    if (!draft) return;
    const text = `Subject: ${draft.subject}\n\n${draft.firstLine}\n\n${draft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable - nothing destructive to fall back to
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <FitScoreBadge score={lead.fitScore} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{investor.name}</h3>
              <TierBadge tier={lead.tier} />
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                {investor.type.replace("_", " ")}
              </span>
            </div>
            {investor.thesis && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{investor.thesis}</p>}

            <div className="mt-2 flex flex-wrap gap-1">
              {investor.sectors.slice(0, 4).map((s) => (
                <span key={s} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {s}
                </span>
              ))}
              {checkRange && <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{checkRange}</span>}
            </div>

            {hasWarmPath && (
              <div className="mt-3 flex items-center gap-1.5 rounded-md bg-emerald-600/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
                <Flame className="h-3.5 w-3.5" />
                You know someone here{lead.bestWarmPath?.mutualName ? ` - ${lead.bestWarmPath.mutualName}` : ""}
              </div>
            )}

            {lead.fitReasons && lead.fitReasons.components.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setEvidenceOpen((v) => !v)}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", evidenceOpen && "rotate-180")} />
                  Why this fits
                </button>
                {evidenceOpen && (
                  <ul className="mt-2 space-y-1.5 border-l-2 pl-3">
                    {lead.fitReasons.components.map((c, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {c.factor.replace(/_/g, " ")} ({c.points}/{c.max})
                        </span>{" "}
                        - {c.evidence}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-4">
              {!draft && (
                <Button size="sm" onClick={handleDraft} disabled={drafting} className="gap-1.5">
                  {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {hasWarmPath ? "Draft my intro request" : "Draft my outreach"}
                </Button>
              )}
              {draftError && <p className="mt-1 text-xs text-destructive">{draftError}</p>}

              {draft && (
                <div className="mt-1 rounded-md border bg-muted/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Draft outreach
                    </span>
                    <Button size="sm" variant="outline" onClick={handleCopy} className="h-7 gap-1 px-2 text-xs">
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <p className="mt-2 text-sm font-medium">{draft.subject}</p>
                  <p className="mt-1 text-sm italic text-muted-foreground">{draft.firstLine}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{draft.body}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
