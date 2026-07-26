import { cn } from "@/lib/utils";
import type { LeadTier } from "@raisely/shared-types";

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600 border-emerald-600/30 bg-emerald-600/10";
  if (score >= 50) return "text-amber-600 border-amber-600/30 bg-amber-600/10";
  return "text-slate-500 border-slate-500/30 bg-slate-500/10";
}

export function FitScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <div className="text-xs text-muted-foreground">Not scored yet</div>;
  }
  return (
    <div
      className={cn(
        "flex h-14 w-14 flex-none flex-col items-center justify-center rounded-full border-2 text-center",
        scoreColor(score)
      )}
    >
      <span className="text-lg font-bold leading-none">{Math.round(score)}</span>
      <span className="text-[9px] uppercase tracking-wide opacity-70">fit</span>
    </div>
  );
}

const TIER_STYLES: Record<LeadTier, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-amber-500 text-white",
  C: "bg-slate-400 text-white",
};

export function TierBadge({ tier }: { tier: LeadTier | null }) {
  if (!tier) return null;
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", TIER_STYLES[tier])}>Tier {tier}</span>
  );
}
