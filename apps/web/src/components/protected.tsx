"use client";

import { AppShell } from "@/components/app-shell";
import { CreateWorkspace } from "@/components/get-started";
import { useSession } from "@/lib/session";

export function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading, needsWorkspace } = useSession();

  if (needsWorkspace) return <CreateWorkspace />;
  if (!session) {
    // Middleware already redirects signed-out visitors to /sign-in, so this
    // only shows briefly while the session/workspace fetch is in flight.
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-muted-foreground">
        {loading ? "Loading..." : null}
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
