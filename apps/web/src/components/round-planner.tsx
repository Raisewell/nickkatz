"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, suggestRoundPlan, type RoundPlanResult } from "@/lib/api";

const STAGES = [
  { value: "pre-seed", label: "Pre-seed" },
  { value: "seed", label: "Seed" },
  { value: "series-a", label: "Series A" },
  { value: "series-b", label: "Series B" },
  { value: "growth", label: "Growth" },
];

export function RoundPlanner() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("seed");
  const [roundSize, setRoundSize] = useState("");
  const [result, setResult] = useState<RoundPlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const roundSizeUsd = Number(roundSize);
    if (!roundSizeUsd || roundSizeUsd <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const plan = await suggestRoundPlan({ stage, roundSizeUsd });
      setResult(plan);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't suggest a list size. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
      >
        Not sure how many investors to target?
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>
      {open && (
        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="round-plan-stage" className="text-xs font-medium text-muted-foreground">
                Stage
              </label>
              <select
                id="round-plan-stage"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="round-plan-size" className="text-xs font-medium text-muted-foreground">
                Round size (USD)
              </label>
              <Input
                id="round-plan-size"
                type="number"
                min={1}
                value={roundSize}
                onChange={(e) => setRoundSize(e.target.value)}
                placeholder="3000000"
                className="mt-1 w-40"
              />
            </div>
            <Button type="submit" size="sm" disabled={loading || !roundSize}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Suggest"}
            </Button>
          </form>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          {result && (
            <div className="mt-4 rounded-md bg-secondary/50 p-3 text-sm">
              <p className="font-medium">
                Target {result.targetListSize.recommended} investors ({result.targetListSize.min}-
                {result.targetListSize.max} range)
              </p>
              <p className="mt-1 text-muted-foreground">{result.rationale}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
