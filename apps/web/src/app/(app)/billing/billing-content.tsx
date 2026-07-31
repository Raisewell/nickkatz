"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>
          {used} / {limit} units this period
        </span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full ${pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function BillingContent() {
  const { data: session } = useSession();
  const { currentWorkspace, currentWorkspaceId } = useWorkspace();
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get("checkout");
  const [actionError, setActionError] = useState<string | null>(null);

  const isOwner = !!session?.user?.id && currentWorkspace?.ownerId === session.user.id;

  const { data: billing, isLoading } = useQuery({
    queryKey: ["billing", currentWorkspaceId],
    queryFn: () => api.getBilling(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const checkoutMutation = useMutation({
    mutationFn: () => api.createCheckoutSession(currentWorkspaceId!),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err: Error) =>
      setActionError(
        err instanceof ApiError && err.status === 503
          ? "Billing isn't configured in this environment yet - Stripe keys haven't been set."
          : err.message
      ),
  });

  const portalMutation = useMutation({
    mutationFn: () => api.createPortalSession(currentWorkspaceId!),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err: Error) =>
      setActionError(
        err instanceof ApiError && err.status === 503
          ? "Billing isn't configured in this environment yet - Stripe keys haven't been set."
          : err.message
      ),
  });

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Billing</h1>

      {checkoutResult === "success" && (
        <p className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm text-emerald-700">
          Checkout complete - your plan will update once Stripe confirms the subscription.
        </p>
      )}
      {checkoutResult === "cancelled" && (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">Checkout was cancelled.</p>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{currentWorkspace?.name ?? "Workspace"}</CardTitle>
            {billing && <Badge variant={billing.plan === "pro" ? "success" : "secondary"}>{billing.plan}</Badge>}
          </div>
          <CardDescription>
            {billing?.subscriptionStatus ? `Subscription: ${billing.subscriptionStatus}` : "No active subscription"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {billing && <UsageBar used={billing.usedThisPeriod} limit={billing.usageLimit} />}

          {billing && !billing.stripeConfigured && (
            <p className="text-xs text-muted-foreground">
              Billing isn&apos;t configured in this environment - set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and
              STRIPE_PRICE_ID_PRO to enable upgrades.
            </p>
          )}

          {!isOwner && (
            <p className="text-xs text-muted-foreground">Only the workspace owner can manage billing.</p>
          )}

          {actionError && <p className="text-sm text-destructive">{actionError}</p>}

          {isOwner && billing && (
            <div className="flex gap-2">
              {billing.plan !== "pro" && (
                <Button disabled={checkoutMutation.isPending} onClick={() => checkoutMutation.mutate()}>
                  {checkoutMutation.isPending ? "Redirecting..." : "Upgrade to Pro"}
                </Button>
              )}
              {billing.subscriptionStatus && (
                <Button
                  variant="secondary"
                  disabled={portalMutation.isPending}
                  onClick={() => portalMutation.mutate()}
                >
                  {portalMutation.isPending ? "Redirecting..." : "Manage billing"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
