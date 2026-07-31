"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LeadCard } from "@/components/lead-card";
import { ApiError, refineQuery, runSearch, saveSearch, type Lead, type SearchSummary } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { StructuredQuery } from "@raisely/shared-types";

const EXAMPLE =
  "Seed-stage fintech and embedded payments investors in the US and UK who've backed similar companies recently";

type Phase = "idle" | "refining" | "searching";

export function SearchLoop() {
  const { session } = useSession();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [interpreted, setInterpreted] = useState<StructuredQuery | null>(null);
  const [results, setResults] = useState<Lead[] | null>(null);
  const [excludedCount, setExcludedCount] = useState(0);
  const [search, setSearch] = useState<SearchSummary | null>(null);
  const [saving, setSaving] = useState(false);

  const busy = phase !== "idle";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session || !text.trim()) return;
    setError(null);
    setLimitReached(false);
    setResults(null);
    setSearch(null);

    try {
      setPhase("refining");
      const refined = await refineQuery(text);
      setInterpreted(refined.query);

      setPhase("searching");
      const searchResult = await runSearch({
        workspaceId: session.workspaceId,
        createdById: session.userId,
        queryText: text,
        structuredQuery: refined.query,
        saved: false,
      });
      setResults([...searchResult.results].sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)));
      setExcludedCount(searchResult.excludedCount);
      setSearch(searchResult.search);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError("You've hit your plan's search limit for this billing period.");
        setLimitReached(true);
      } else {
        setError("Something went wrong running that search. Try again.");
      }
    } finally {
      setPhase("idle");
    }
  }

  async function handleSaveToggle() {
    if (!session || !search) return;
    setSaving(true);
    try {
      const updated = await saveSearch(search.id, { workspaceId: session.workspaceId, userId: session.userId, saved: !search.saved });
      setSearch(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold">Who are you trying to reach?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe the round - stage, sector, geography, anything that matters. We&apos;ll turn it into ranked,
          evidence-backed matches.
        </p>

        <form onSubmit={handleSubmit} className="mt-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            rows={3}
            disabled={busy}
            className="text-base"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {phase === "refining" && "Reading your ask..."}
              {phase === "searching" && "Matching against your exclusion list and scoring fit..."}
            </p>
            <Button type="submit" size="lg" disabled={busy || !text.trim()} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Find my investors
            </Button>
          </div>
        </form>

        {error && (
          <p className="mt-3 text-sm text-destructive">
            {error}
            {limitReached && (
              <>
                {" "}
                <Link href="/billing" className="underline">
                  Upgrade to keep going.
                </Link>
              </>
            )}
          </p>
        )}

        {interpreted && results && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {interpreted.sectors.map((s) => (
              <span key={s} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {s}
              </span>
            ))}
            {interpreted.stages.map((s) => (
              <span key={s} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {s}
              </span>
            ))}
            {interpreted.geographies.map((g) => (
              <span key={g} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {results && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {results.length} match{results.length === 1 ? "" : "es"}
              {excludedCount > 0 && ` - ${excludedCount} filtered by your exclusion list`}
            </h3>
            {search && (
              <Button variant="outline" size="sm" onClick={handleSaveToggle} disabled={saving} className="gap-1.5">
                {search.saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                {search.saved ? "Saved" : "Save this search"}
              </Button>
            )}
          </div>

          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-2 h-5 w-5" />
              No matches for that combination yet. Try broadening the sector, stage, or geography.
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
