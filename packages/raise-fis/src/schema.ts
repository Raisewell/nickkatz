import { z } from "zod";

/** Closed taxonomy from RAISE_FIS_V1_Operating_Guide.md */
export const OBJECTION_CATEGORIES = [
  "team",
  "product",
  "market",
  "traction",
  "valuation",
  "timing",
  "GTM",
  "defensibility",
  "business_model",
  "other",
] as const;

export const SENTIMENTS = ["positive", "neutral", "negative"] as const;

/** pending: just extracted. approved: reviewed and confirmed. corrected: reviewed and edited. */
export const STATUSES = ["pending", "approved", "corrected"] as const;

/** Fields where the manual explicitly allows the sentinel "not_discussed" instead of a real value. */
export const NOT_DISCUSSED_FIELDS = [
  "top_objection",
  "strongest_signal",
  "weakest_signal",
  "trigger_that_worked",
  "trigger_that_failed",
  "strategic_feedback",
  "evidence_snippet_1",
  "evidence_snippet_2",
] as const;

/** 1-5 integer fields, per the Score reference table. Used to coerce CSV string cells back to numbers. */
export const SCORE_FIELDS = [
  "founder_confidence",
  "clarity_of_thought",
  "communication_quality",
  "team_strength_score",
  "product_clarity",
  "market_size_believability",
  "traction_level",
  "vision_strength",
  "interest_level",
  "confidence_score",
] as const;

/** The five-pillar model (manual section 9): team, product, market, traction, vision. */
export const PILLAR_FIELDS = [
  "team_strength_score",
  "product_clarity",
  "market_size_believability",
  "traction_level",
  "vision_strength",
] as const;

const score = z.number().int().min(1).max(5);
const nonEmptyText = z.string().trim().min(1);

export const callRecordSchema = z.object({
  call_id: z
    .string()
    .regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, "call_id must be lowercase snake_case (e.g. company_investorfirm_20260401)"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  founder_name: nonEmptyText,
  investor_name: nonEmptyText, // may legitimately be the literal string "unclear"
  investor_firm: nonEmptyText,
  call_type: nonEmptyText,
  founder_confidence: score,
  clarity_of_thought: score,
  communication_quality: score,
  team_strength_score: score,
  product_clarity: score,
  market_size_believability: score,
  traction_level: score,
  vision_strength: score,
  why_now_signal: nonEmptyText,
  interest_level: score,
  sentiment: z.enum(SENTIMENTS),
  top_objection: nonEmptyText, // may be "not_discussed"
  objection_category: z.enum(OBJECTION_CATEGORIES),
  strongest_signal: nonEmptyText, // may be "not_discussed"
  weakest_signal: nonEmptyText, // may be "not_discussed"
  trigger_that_worked: nonEmptyText, // may be "not_discussed"
  trigger_that_failed: nonEmptyText, // may be "not_discussed"
  suggested_improvement: nonEmptyText,
  strategic_feedback: nonEmptyText, // may be "not_discussed"
  evidence_snippet_1: nonEmptyText, // may be "not_discussed"
  evidence_snippet_2: nonEmptyText, // may be "not_discussed"
  confidence_score: score,
  status: z.enum(STATUSES),
});

export type CallRecord = z.infer<typeof callRecordSchema>;

/** Canonical column order — must match RAISE_FIS_master_calls.csv exactly. */
export const CALL_RECORD_COLUMNS = Object.keys(callRecordSchema.shape) as (keyof CallRecord)[];

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  record?: CallRecord;
  issues: ValidationIssue[];
  /** Non-fatal review prompts from the operating guide's Step 3 checklist. */
  reviewFlags: string[];
}

/**
 * Validates a raw extraction object against the schema, then layers on the
 * qualitative review checks from Step 3 of the operating guide (these don't
 * fail validation — they're printed for the human reviewer to check before
 * approving the row).
 */
export function validateCallRecord(raw: unknown): ValidationResult {
  const parsed = callRecordSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      reviewFlags: [],
    };
  }

  const record = parsed.data;
  const reviewFlags: string[] = [];

  const evidenceIsThin =
    (record.evidence_snippet_1 === "not_discussed" || record.evidence_snippet_1.length < 15) &&
    (record.evidence_snippet_2 === "not_discussed" || record.evidence_snippet_2.length < 15);
  if (evidenceIsThin) {
    reviewFlags.push(
      "Both evidence snippets are missing or very short — confirm the extracted conclusions are actually supported by the source material."
    );
  }

  if (record.suggested_improvement.split(/\s+/).length < 6) {
    reviewFlags.push("suggested_improvement looks generic/short — check it is specific and actionable, not boilerplate.");
  }

  if (record.confidence_score <= 2) {
    reviewFlags.push(
      `confidence_score is low (${record.confidence_score}) — per the operating guide, consider pulling the full transcript instead of relying on this extraction.`
    );
  }

  return { ok: true, record, issues: [], reviewFlags };
}
