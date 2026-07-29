"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Protected } from "@/components/protected";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listNotifications, markNotificationRead, type Notification } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

function describeNotification(n: Notification): string {
  if (n.type === "DISCOVERY_RUN_STATUS_CHANGED") {
    const status = String(n.payload.status ?? "").toLowerCase().replace(/_/g, " ");
    return `Discovery run ${status}`;
  }
  return n.type.replace(/_/g, " ").toLowerCase();
}

function NotificationsList() {
  const { session } = useSession();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listNotifications({ workspaceId: session.workspaceId, userId: session.userId })
      .then(setNotifications)
      .catch(() => setError("Couldn't load your notifications."));
  }, [session]);

  async function handleMarkRead(id: string) {
    if (!session || !notifications) return;
    const previous = notifications;
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    try {
      await markNotificationRead(id, { workspaceId: session.workspaceId, userId: session.userId });
    } catch {
      setNotifications(previous);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!notifications) return <p className="text-sm text-muted-foreground">Loading...</p>;

  if (notifications.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        <Bell className="mx-auto mb-2 h-5 w-5" />
        No notifications yet. Discovery runs and other background jobs will show up here as they finish.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <Card key={n.id} className={cn(!n.readAt && "border-primary/40 bg-primary/5")}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className={cn("text-sm capitalize", !n.readAt && "font-semibold")}>{describeNotification(n)}</p>
              <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
            {!n.readAt && (
              <Button variant="ghost" size="sm" onClick={() => handleMarkRead(n.id)} className="gap-1.5">
                <CheckCheck className="h-3.5 w-3.5" />
                Mark read
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Protected>
      <h1 className="text-xl font-semibold">Notifications</h1>
      <p className="mt-1 text-sm text-muted-foreground">Updates on discovery runs and other background jobs.</p>
      <div className="mt-6">
        <NotificationsList />
      </div>
    </Protected>
  );
}
