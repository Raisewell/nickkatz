/**
 * Rule-of-thumb target list sizes by stage, reflecting common fundraising
 * guidance (wider nets earlier/smaller, tighter relationship-driven lists
 * at growth) - not a scientific model, just a reasonable starting point the
 * founder can override.
 */
interface StageRule {
  min: number;
  max: number;
  typicalRoundSizeUsd: number;
  note: string;
}

const STAGE_RULES: Record<string, StageRule> = {
  "pre-seed": {
    min: 40,
    max: 80,
    typicalRoundSizeUsd: 500_000,
    note: "Pre-seed rounds usually close on relationships and conviction more than volume - a smaller, high-fit list tends to outperform a wide net.",
  },
  seed: {
    min: 80,
    max: 150,
    typicalRoundSizeUsd: 3_000_000,
    note: "Classic seed rule of thumb: budget for volume, since reply and conversion rates are both modest at this stage.",
  },
  "series-a": {
    min: 60,
    max: 120,
    typicalRoundSizeUsd: 12_000_000,
    note: "Series A investors are more selective and do more diligence before a first call - a tighter, well-qualified list beats a wide one.",
  },
  "series-b": {
    min: 30,
    max: 70,
    typicalRoundSizeUsd: 30_000_000,
    note: "Fewer, larger-check investors at this stage; warm intros matter more than cold outbound volume.",
  },
  growth: {
    min: 15,
    max: 40,
    typicalRoundSizeUsd: 75_000_000,
    note: "A small pool of specialist growth/late-stage funds - this is a relationship-driven process, not a numbers game.",
  },
};

export const ROUND_PLAN_STAGES = Object.keys(STAGE_RULES);

export class UnknownRoundPlanStageError extends Error {
  constructor(stage: string) {
    super(`Unknown stage "${stage}". Expected one of: ${ROUND_PLAN_STAGES.join(", ")}`);
    this.name = "UnknownRoundPlanStageError";
  }
}

export interface RoundPlanInput {
  stage: string;
  roundSizeUsd: number;
}

export interface RoundPlanResult {
  stage: string;
  roundSizeUsd: number;
  targetListSize: { min: number; max: number; recommended: number };
  rationale: string;
}

export function suggestTargetListSize(input: RoundPlanInput): RoundPlanResult {
  const stage = input.stage.toLowerCase().trim();
  const rule = STAGE_RULES[stage];
  if (!rule) throw new UnknownRoundPlanStageError(input.stage);

  // A round larger than typical for the stage skews the recommendation
  // toward the top of the range (more checks needed to fill it), and vice
  // versa - clamped so an extreme round size doesn't blow past the range.
  const ratio = input.roundSizeUsd / rule.typicalRoundSizeUsd;
  const clamped = Math.min(2, Math.max(0.5, ratio));
  const normalized = (clamped - 0.5) / 1.5;
  const recommended = Math.round(rule.min + (rule.max - rule.min) * normalized);

  return {
    stage,
    roundSizeUsd: input.roundSizeUsd,
    targetListSize: { min: rule.min, max: rule.max, recommended },
    rationale: rule.note,
  };
}
