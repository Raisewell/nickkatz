"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  approveDiscoveryRun,
  createDiscoveryRun,
  getDiscoveryRun,
  type DiscoveryRun,
} from "@/lib/api";
import { useSession } from "@/lib/session";

const POLL_MS = 2000;
const RUNNING_STATUSES = new Set(["QUEUED", "RUNNING", "APPROVED"]);

export function DiscoveryFlow() {
  const { session } = useSession();
  const [companies, setCompanies] = useState<string[]>([]);
  const [companyInput, setCompanyInput] = useState("");
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [approving, setApproving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(runId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (!session) return;
      try {
        const updated = await getDiscoveryRun(runId, { workspaceId: session.workspaceId, userId: session.userId });
        setRun(updated);
        if (!RUNNING_STATUSES.has(updated.status) && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, POLL_MS);
  }

  function addCompany() {
    const value = companyInput.trim();
    if (value && !companies.includes(value)) setCompanies([...companies, value]);
    setCompanyInput("");
  }

  async function handleStart(e: FormEvent) {
    e.preventDefault();
    if (!session || companies.length < 3) return;
    setError(null);
    setStarting(true);
    try {
      const created = await createDiscoveryRun({
        workspaceId: session.workspaceId,
        createdById: session.userId,
        comparableCompanies: companies,
      });
      setRun(created);
      startPolling(created.id);
    } catch {
      setError("Couldn't start that discovery run - try again.");
    } finally {
      setStarting(false);
    }
  }

  async function handleApprove() {
    if (!session || !run || selected.size === 0) return;
    setApproving(true);
    try {
      const updated = await approveDiscoveryRun(run.id, {
        workspaceId: session.workspaceId,
        userId: session.userId,
        approvedInvestorIds: Array.from(selected),
      });
      setRun(updated);
      startPolling(run.id);
    } catch {
      setError("Couldn't approve those candidates - try again.");
    } finally {
      setApproving(false);
    }
  }

  function toggleSelected(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const showForm = !run || run.status === "FAILED";

  return (
    <div>
      {showForm && (
        <form
          onSubmit={handleStart}
          onKeyDown={(e) => {
            if (e.key === "Enter" && document.activeElement?.tagName === "INPUT") {
              e.preventDefault();
              addCompany();
            }
          }}
        >
          <p className="text-sm text-muted-foreground">
            Name 3-10 companies whose investors you&apos;d want to pitch too - we&apos;ll find who backed them and expand
            through the co-investment graph.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={companyInput}
              onChange={(e) => setCompanyInput(e.target.value)}
              placeholder="e.g. Stripe, Ramp, Mercury"
            />
            <Button type="button" variant="outline" onClick={addCompany} disabled={!companyInput.trim()}>
              Add
            </Button>
          </div>
          {companies.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {companies.map((c) => (
                <span key={c} className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                  {c}
                  <button type="button" onClick={() => setCompanies(companies.filter((x) => x !== c))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Button type="submit" size="lg" className="mt-4 gap-2" disabled={companies.length < 3 || starting}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Find lookalike investors
          </Button>
          {companies.length > 0 && companies.length < 3 && (
            <p className="mt-2 text-xs text-muted-foreground">Add at least {3 - companies.length} more.</p>
          )}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </form>
      )}

      {run && (run.status === "QUEUED" || run.status === "RUNNING") && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Matching {run.comparableCompanies.join(", ")} against the co-investment graph...
        </div>
      )}

      {run?.status === "AWAITING_APPROVAL" && run.previewResults && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {run.previewResults.candidates.length} candidates found - pick which ones to merge into a new search
          </h2>
          <div className="mt-3 space-y-2">
            {run.previewResults.candidates.map((c) => (
              <Card key={c.investorId}>
                <CardContent className="flex items-start gap-3 p-4">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(c.investorId)}
                    onChange={() => toggleSelected(c.investorId)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{c.investorName}</p>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {c.matchType === "direct" ? "direct backer" : "co-investment"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{c.reason}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button className="mt-4 gap-2" onClick={handleApprove} disabled={selected.size === 0 || approving}>
            {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Merge {selected.size || ""} into a search
          </Button>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      )}

      {run?.status === "APPROVED" && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Enriching approved firms and building your search...
        </div>
      )}

      {run?.status === "COMPLETE" && run.resultSearchId && (
        <div className="mt-6 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-medium">Done - your lookalike search is ready.</p>
          <Button asChild className="mt-2">
            <Link href={`/saved-searches/${run.resultSearchId}`}>View results</Link>
          </Button>
        </div>
      )}

      {run?.status === "FAILED" && (
        <p className="mt-4 text-sm text-destructive">{run.error ?? "That discovery run failed. Try again with different companies."}</p>
      )}
    </div>
  );
}
