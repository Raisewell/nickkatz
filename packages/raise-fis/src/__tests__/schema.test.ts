import { describe, expect, it } from "vitest";
import { validateCallRecord } from "../schema.js";

const validRecord = {
  call_id: "propelr_pilabs_20260401",
  date: "2026-04-01",
  founder_name: "Fin Bullough",
  investor_name: "Dhruv Gupta",
  investor_firm: "Pi Labs",
  call_type: "investor_pitch",
  founder_confidence: 4,
  clarity_of_thought: 4,
  communication_quality: 4,
  team_strength_score: 3,
  product_clarity: 4,
  market_size_believability: 3,
  traction_level: 4,
  vision_strength: 3,
  why_now_signal: "Revenue per transaction growing rapidly.",
  interest_level: 4,
  sentiment: "positive",
  top_objection: "No dominant player has emerged in this space.",
  objection_category: "market",
  strongest_signal: "Knight Frank partnership.",
  weakest_signal: "UK-only market size framing.",
  trigger_that_worked: "Knight Frank endorsement framed as a trust signal.",
  trigger_that_failed: "UK-only market size framing.",
  suggested_improvement: "Develop a credible international expansion narrative.",
  strategic_feedback: "not_discussed",
  evidence_snippet_1: "Dhruv: No dominant player has emerged in this space.",
  evidence_snippet_2: "Knight Frank partnership landed well.",
  confidence_score: 4,
  status: "pending",
};

describe("validateCallRecord", () => {
  it("accepts a well-formed record", () => {
    const result = validateCallRecord(validRecord);
    expect(result.ok).toBe(true);
    expect(result.record?.call_id).toBe("propelr_pilabs_20260401");
  });

  it("accepts the not_discussed sentinel on eligible fields", () => {
    const result = validateCallRecord({ ...validRecord, top_objection: "not_discussed", evidence_snippet_1: "not_discussed" });
    expect(result.ok).toBe(true);
  });

  it("rejects an objection_category outside the closed taxonomy", () => {
    const result = validateCallRecord({ ...validRecord, objection_category: "vibes" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === "objection_category")).toBe(true);
  });

  it("rejects a score outside 1-5", () => {
    const result = validateCallRecord({ ...validRecord, interest_level: 7 });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-integer score", () => {
    const result = validateCallRecord({ ...validRecord, founder_confidence: 3.5 });
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed date", () => {
    const result = validateCallRecord({ ...validRecord, date: "04/01/2026" });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid status value", () => {
    const result = validateCallRecord({ ...validRecord, status: "in_review" });
    expect(result.ok).toBe(false);
  });

  it("flags thin evidence for human review without failing validation", () => {
    const result = validateCallRecord({ ...validRecord, evidence_snippet_1: "not_discussed", evidence_snippet_2: "not_discussed" });
    expect(result.ok).toBe(true);
    expect(result.reviewFlags.some((f) => f.includes("evidence snippets"))).toBe(true);
  });

  it("flags low confidence_score for human review", () => {
    const result = validateCallRecord({ ...validRecord, confidence_score: 2 });
    expect(result.ok).toBe(true);
    expect(result.reviewFlags.some((f) => f.includes("confidence_score is low"))).toBe(true);
  });
});
