"use client";

import { Protected } from "@/components/protected";
import { DiscoveryFlow } from "@/components/discovery-flow";

export default function DiscoveryPage() {
  return (
    <Protected>
      <h1 className="text-xl font-semibold">Lookalike discovery</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Find investors who&apos;ve backed companies like yours, then expand through who else co-invests with them.
      </p>
      <div className="mt-6">
        <DiscoveryFlow />
      </div>
    </Protected>
  );
}
