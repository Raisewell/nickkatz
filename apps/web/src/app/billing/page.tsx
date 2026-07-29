"use client";

import { Protected } from "@/components/protected";
import { BillingPanel } from "@/components/billing-panel";

export default function BillingPage() {
  return (
    <Protected>
      <h1 className="text-xl font-semibold">Billing</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your plan, usage, and subscription.</p>
      <div className="mt-6 max-w-2xl">
        <BillingPanel />
      </div>
    </Protected>
  );
}
