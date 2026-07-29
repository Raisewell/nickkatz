"use client";

import { AppShell } from "@/components/app-shell";
import { GetStarted } from "@/components/get-started";
import { useSession } from "@/lib/session";

export function Protected({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  if (!session) return <GetStarted />;
  return <AppShell>{children}</AppShell>;
}
