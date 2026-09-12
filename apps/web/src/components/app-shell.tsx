"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Search" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/saved-searches", label: "Saved searches" },
  { href: "/discovery", label: "Discovery" },
  { href: "/exclusions", label: "Exclusions" },
  { href: "/network", label: "Network" },
  { href: "/notifications", label: "Notifications" },
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, workspaces, switchWorkspace, signOut } = useSession();
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Raisely
            </Link>
            <div className="flex items-center gap-3">
              {session && workspaces.length > 1 ? (
                <select
                  value={session.workspaceId}
                  onChange={(e) => switchWorkspace(e.target.value)}
                  aria-label="Switch workspace"
                  className="hidden h-8 max-w-[10rem] truncate rounded-md border border-input bg-background px-2 text-sm text-muted-foreground sm:inline-block"
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="hidden text-sm text-muted-foreground sm:inline">{session?.workspaceName}</span>
              )}
              <NotificationBell />
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </div>
          {/* A single scrollable row (not flex-wrap) at every viewport width - eight links
              wrapped into a second line used to interleave visually with the logo/sign-out
              row above it on narrow screens (its height grew while the row's own
              items-center still centered against that taller wrapped block). */}
          <nav className="-mx-1 mt-2 flex items-center gap-1 overflow-x-auto px-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === link.href && "bg-accent text-accent-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}
