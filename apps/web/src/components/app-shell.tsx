"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";

const NAV_LINKS = [
  { href: "/searches", label: "Searches" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/discovery", label: "Discovery" },
  { href: "/network", label: "Network" },
  { href: "/billing", label: "Billing" },
];

function WorkspaceSwitcher() {
  const { workspaces, currentWorkspaceId, setCurrentWorkspaceId, isLoading } = useWorkspace();

  if (isLoading) return <span className="text-sm text-muted-foreground">Loading workspaces...</span>;
  if (workspaces.length === 0) return <span className="text-sm text-muted-foreground">No workspaces</span>;

  return (
    <select
      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
      value={currentWorkspaceId ?? ""}
      onChange={(e) => setCurrentWorkspaceId(e.target.value)}
      aria-label="Workspace"
    >
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}

function AccountMenu() {
  const { data: session } = useSession();
  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{session.user.name ?? session.user.email}</span>
      <Button size="sm" variant="ghost" onClick={() => signOut({ callbackUrl: "/sign-in" })}>
        Sign out
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/searches" className="text-lg font-bold tracking-tight">
              Raisely
            </Link>
            <nav className="flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
                    pathname?.startsWith(link.href)
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <WorkspaceSwitcher />
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="container flex-1 py-8">{children}</main>
    </div>
  );
}
