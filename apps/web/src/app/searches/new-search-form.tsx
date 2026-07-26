"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { INVESTOR_TYPES, type InvestorType, type StructuredQuery } from "@raisely/shared-types";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_QUERY: StructuredQuery = {
  stages: [],
  sectors: [],
  geographies: [],
  checkRange: { min: null, max: null },
  investorTypes: [],
  keywords: [],
};

function toCsv(values: string[]) {
  return values.join(", ");
}

function fromCsv(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function NewSearchForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentWorkspaceId, currentUserId } = useWorkspace();

  const [name, setName] = useState("");
  const [queryText, setQueryText] = useState("");
  const [query, setQuery] = useState<StructuredQuery>(EMPTY_QUERY);
  const [warning, setWarning] = useState<string | null>(null);

  const parseMutation = useMutation({
    mutationFn: () => api.refineQuery(queryText),
    onSuccess: (result) => {
      setQuery(result.query);
      setWarning(result.usedFallback ? result.warning ?? "Fell back to keyword parsing." : null);
    },
  });

  const runMutation = useMutation({
    mutationFn: () => {
      if (!currentWorkspaceId || !currentUserId) throw new Error("No workspace/user selected");
      return api.runSearch({
        workspaceId: currentWorkspaceId,
        createdById: currentUserId,
        name: name || undefined,
        queryText: queryText || undefined,
        structuredQuery: query,
        saved: true,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["searches", currentWorkspaceId] });
      router.push(`/searches/${result.search.id}`);
    },
  });

  const toggleInvestorType = (type: InvestorType) => {
    setQuery((q) => ({
      ...q,
      investorTypes: q.investorTypes.includes(type)
        ? q.investorTypes.filter((t) => t !== type)
        : [...q.investorTypes, type],
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New search</CardTitle>
        <CardDescription>
          Describe who you&apos;re looking for, or fill in the filters directly, then run the search.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Search name (optional)</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="B2B fintech seed - London" />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Describe who you&apos;re looking for</label>
          <Textarea
            rows={3}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Seed-stage fintech investors in London who write $250k-$1M checks"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!queryText || parseMutation.isPending}
            onClick={() => parseMutation.mutate()}
          >
            {parseMutation.isPending ? "Parsing..." : "Parse into filters"}
          </Button>
          {warning && <p className="text-xs text-amber-600">{warning}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Sectors</label>
            <Input
              value={toCsv(query.sectors)}
              onChange={(e) => setQuery((q) => ({ ...q, sectors: fromCsv(e.target.value) }))}
              placeholder="fintech, b2b saas"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Stages</label>
            <Input
              value={toCsv(query.stages)}
              onChange={(e) => setQuery((q) => ({ ...q, stages: fromCsv(e.target.value) }))}
              placeholder="seed, series a"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Geographies</label>
            <Input
              value={toCsv(query.geographies)}
              onChange={(e) => setQuery((q) => ({ ...q, geographies: fromCsv(e.target.value) }))}
              placeholder="london, uk"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Keywords</label>
            <Input
              value={toCsv(query.keywords)}
              onChange={(e) => setQuery((q) => ({ ...q, keywords: fromCsv(e.target.value) }))}
              placeholder="marketplace, embedded finance"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Min check ($)</label>
            <Input
              type="number"
              value={query.checkRange.min ?? ""}
              onChange={(e) =>
                setQuery((q) => ({
                  ...q,
                  checkRange: { ...q.checkRange, min: e.target.value ? Number(e.target.value) : null },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Max check ($)</label>
            <Input
              type="number"
              value={query.checkRange.max ?? ""}
              onChange={(e) =>
                setQuery((q) => ({
                  ...q,
                  checkRange: { ...q.checkRange, max: e.target.value ? Number(e.target.value) : null },
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Investor types</label>
          <div className="flex flex-wrap gap-3">
            {INVESTOR_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={query.investorTypes.includes(type)}
                  onChange={() => toggleInvestorType(type)}
                />
                {type}
              </label>
            ))}
          </div>
        </div>

        {runMutation.isError && (
          <p className="text-sm text-destructive">{(runMutation.error as Error).message}</p>
        )}

        <Button
          disabled={!currentWorkspaceId || !currentUserId || runMutation.isPending}
          onClick={() => runMutation.mutate()}
        >
          {runMutation.isPending ? "Running..." : "Run search"}
        </Button>
      </CardContent>
    </Card>
  );
}
