import { describe, it, expect } from "vitest";
import { suggestTargetListSize, UnknownRoundPlanStageError } from "./round-planning.js";

describe("suggestTargetListSize", () => {
  it("recommends near the middle of the range for a typically-sized round", () => {
    const result = suggestTargetListSize({ stage: "seed", roundSizeUsd: 3_000_000 });
    expect(result.targetListSize.min).toBe(80);
    expect(result.targetListSize.max).toBe(150);
    expect(result.targetListSize.recommended).toBeGreaterThan(80);
    expect(result.targetListSize.recommended).toBeLessThan(150);
  });

  it("skews toward the top of the range for a larger-than-typical round", () => {
    const typical = suggestTargetListSize({ stage: "seed", roundSizeUsd: 3_000_000 });
    const big = suggestTargetListSize({ stage: "seed", roundSizeUsd: 6_000_000 });
    expect(big.targetListSize.recommended).toBeGreaterThan(typical.targetListSize.recommended);
  });

  it("skews toward the bottom of the range for a smaller-than-typical round", () => {
    const typical = suggestTargetListSize({ stage: "seed", roundSizeUsd: 3_000_000 });
    const small = suggestTargetListSize({ stage: "seed", roundSizeUsd: 1_000_000 });
    expect(small.targetListSize.recommended).toBeLessThan(typical.targetListSize.recommended);
  });

  it("never recommends outside [min, max] even for extreme round sizes", () => {
    const huge = suggestTargetListSize({ stage: "seed", roundSizeUsd: 100_000_000 });
    expect(huge.targetListSize.recommended).toBeLessThanOrEqual(huge.targetListSize.max);
    const tiny = suggestTargetListSize({ stage: "seed", roundSizeUsd: 1 });
    expect(tiny.targetListSize.recommended).toBeGreaterThanOrEqual(tiny.targetListSize.min);
  });

  it("is case-insensitive on stage", () => {
    const result = suggestTargetListSize({ stage: "Series-A", roundSizeUsd: 12_000_000 });
    expect(result.stage).toBe("series-a");
  });

  it("throws UnknownRoundPlanStageError for an unrecognized stage", () => {
    expect(() => suggestTargetListSize({ stage: "unicorn", roundSizeUsd: 1 })).toThrow(UnknownRoundPlanStageError);
  });
});
