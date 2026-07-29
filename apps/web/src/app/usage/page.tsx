"use client";

import { useEffect, useState } from "react";
import { Protected } from "@/components/protected";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getUsage, type UsageSummary } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

function UsagePanel() {
  const { session } = useSession();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    getUsage({ workspaceId: session.workspaceId, userId: session.userId })
      .then(setUsage)
      .catch(() => setError("Couldn't load your usage."));
  }, [session]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!usage) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const pct = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const nearLimit = pct >= 80;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>This billing period</CardTitle>
        <CardDescription>Searches, discovery runs, outreach drafts, and exports all count against your plan.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold">{usage.used}</span>
          <span className="text-sm text-muted-foreground">of {usage.limit} used</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", nearLimit ? "bg-destructive" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {usage.remaining} action{usage.remaining === 1 ? "" : "s"} remaining - resets{" "}
          {new Date(new Date(usage.periodStart).getFullYear(), new Date(usage.periodStart).getMonth() + 1, 1).toLocaleDateString(
            undefined,
            { month: "long", day: "numeric" }
          )}
        </p>
        {nearLimit && (
          <p className="mt-3 text-sm font-medium text-destructive">
            You&apos;re close to this period&apos;s limit - upgrade to keep searching without interruption.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function UsagePage() {
  return (
    <Protected>
      <h1 className="text-xl font-semibold">Usage</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track what&apos;s counted against your plan this period.</p>
      <div className="mt-6">
        <UsagePanel />
      </div>
    </Protected>
  );
}
