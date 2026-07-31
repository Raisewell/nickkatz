"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
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
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useSession();
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Raisely
            </Link>
            <nav className="flex flex-wrap items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                    pathname === link.href && "bg-accent text-accent-foreground"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{session?.workspaceName}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}
