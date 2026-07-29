"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ApiError,
  createCheckoutSession,
  createPortalSession,
  getBillingSummary,
  getUsage,
  listPlans,
} from "@/lib/api";
import { useSession } from "@/lib/session";

function currentUrl(): string {
  return window.location.href;
}

export function BillingPanel() {
  const { session } = useSession();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: ["billing", session?.workspaceId],
    queryFn: () => getBillingSummary({ workspaceId: session!.workspaceId, userId: session!.userId }),
    enabled: Boolean(session),
  });

  const { data: usage } = useQuery({
    queryKey: ["usage", session?.workspaceId],
    queryFn: () => getUsage({ workspaceId: session!.workspaceId, userId: session!.userId }),
    enabled: Boolean(session),
  });

  const { data: plansData } = useQuery({
    queryKey: ["plans"],
    queryFn: () => listPlans(),
  });

  async function handleUpgrade(planId: string) {
    if (!session) return;
    setActionError(null);
    setBusyPlan(planId);
    try {
      const { url } = await createCheckoutSession({
        workspaceId: session.workspaceId,
        userId: session.userId,
        plan: planId,
        successUrl: currentUrl(),
        cancelUrl: currentUrl(),
      });
      window.location.href = url;
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 503
          ? "Billing isn't configured yet - set STRIPE_SECRET_KEY on the API to enable checkout."
          : "Couldn't start checkout right now - try again in a moment."
      );
    } finally {
      setBusyPlan(null);
    }
  }

  async function handleManageBilling() {
    if (!session) return;
    setActionError(null);
    setPortalBusy(true);
    try {
      const { url } = await createPortalSession({
        workspaceId: session.workspaceId,
        userId: session.userId,
        returnUrl: currentUrl(),
      });
      window.location.href = url;
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 503
          ? "Billing isn't configured yet - set STRIPE_SECRET_KEY on the API to enable the billing portal."
          : "Couldn't open the billing portal right now - try again in a moment."
      );
    } finally {
      setPortalBusy(false);
    }
  }

  if (!session) return null;

  if (billingLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading billing...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Current plan</h2>
              <p className="mt-1 text-lg font-semibold">{billing?.planLabel}</p>
            </div>
            {billing?.hasStripeCustomer && (
              <Button variant="outline" size="sm" onClick={handleManageBilling} disabled={portalBusy}>
                {portalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Manage billing"}
              </Button>
            )}
          </div>

          {usage && (
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Usage this period</span>
                <span>
                  {usage.used} / {usage.limit}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {billing?.subscriptionStatus && (
            <p className="text-xs text-muted-foreground">
              Subscription status: {billing.subscriptionStatus.toLowerCase().replace("_", " ")}
              {billing.currentPeriodEnd &&
                ` - renews ${new Date(billing.currentPeriodEnd).toLocaleDateString()}`}
            </p>
          )}
        </CardContent>
      </Card>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {plansData && plansData.plans.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold">Upgrade</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {plansData.plans.map((plan) => (
              <Card key={plan.id}>
                <CardContent className="space-y-3 p-5">
                  <div>
                    <p className="font-semibold">{plan.label}</p>
                    <p className="text-sm text-muted-foreground">{plan.usageLimit} actions / month</p>
                  </div>
                  <Button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={busyPlan === plan.id || billing?.plan === plan.id}
                    className="w-full"
                  >
                    {busyPlan === plan.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : billing?.plan === plan.id ? (
                      "Current plan"
                    ) : (
                      `Upgrade to ${plan.label}`
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
