import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendCallRecord, readMasterCsv } from "../csv.js";
import type { CallRecord } from "../schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_CSV = path.join(__dirname, "..", "..", "data", "RAISE_FIS_master_calls.csv");

const newRecord: CallRecord = {
  call_id: "testco_testfund_20260710",
  date: "2026-07-10",
  founder_name: "Test Founder",
  investor_name: "Test Investor",
  investor_firm: "Test Fund",
  call_type: "investor_pitch",
  founder_confidence: 3,
  clarity_of_thought: 3,
  communication_quality: 3,
  team_strength_score: 3,
  product_clarity: 3,
  market_size_believability: 3,
  traction_level: 3,
  vision_strength: 3,
  why_now_signal: "not_discussed",
  interest_level: 3,
  sentiment: "neutral",
  top_objection: "not_discussed",
  objection_category: "other",
  strongest_signal: "not_discussed",
  weakest_signal: "not_discussed",
  trigger_that_worked: "not_discussed",
  trigger_that_failed: "not_discussed",
  suggested_improvement: "Run a follow-up call with a tighter agenda.",
  strategic_feedback: "not_discussed",
  evidence_snippet_1: "not_discussed",
  evidence_snippet_2: "not_discussed",
  confidence_score: 3,
  status: "pending",
};

describe("readMasterCsv (seed dataset)", () => {
  it("parses all seed rows with no validation failures", () => {
    const { rows, invalidRows } = readMasterCsv(SEED_CSV);
    expect(invalidRows).toEqual([]);
    expect(rows.length).toBe(10);
  });

  it("coerces score columns back to numbers", () => {
    const { rows } = readMasterCsv(SEED_CSV);
    const row = rows.find((r) => r.record.call_id === "propelr_pilabs_20260401");
    expect(row?.record.founder_confidence).toBe(4);
    expect(typeof row?.record.founder_confidence).toBe("number");
  });
});

describe("appendCallRecord", () => {
  let tmpDir: string;
  let csvPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "raise-fis-test-"));
    csvPath = path.join(tmpDir, "master.csv");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a new CSV with a header when none exists", () => {
    const result = appendCallRecord(csvPath, newRecord);
    expect(result).toEqual({ status: "appended", totalRows: 1 });
    const { rows } = readMasterCsv(csvPath);
    expect(rows[0].record.call_id).toBe(newRecord.call_id);
  });

  it("rejects a duplicate call_id without --overwrite", () => {
    appendCallRecord(csvPath, newRecord);
    const result = appendCallRecord(csvPath, newRecord);
    expect(result.status).toBe("duplicate_rejected");
    const { rows } = readMasterCsv(csvPath);
    expect(rows.length).toBe(1);
  });

  it("overwrites the existing row when --overwrite is set", () => {
    appendCallRecord(csvPath, newRecord);
    const corrected = { ...newRecord, status: "corrected" as const, sentiment: "positive" as const };
    const result = appendCallRecord(csvPath, corrected, { overwrite: true });
    expect(result.status).toBe("overwritten");
    const { rows } = readMasterCsv(csvPath);
    expect(rows.length).toBe(1);
    expect(rows[0].record.status).toBe("corrected");
  });

  it("appends onto a pre-existing seeded CSV without disturbing other rows", () => {
    const { rows: seedRows } = readMasterCsv(SEED_CSV);
    for (const r of seedRows) {
      appendCallRecord(csvPath, r.record);
    }
    const result = appendCallRecord(csvPath, newRecord);
    expect(result.totalRows).toBe(seedRows.length + 1);
  });
});
