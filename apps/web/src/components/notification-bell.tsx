"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { listNotifications, markNotificationRead, type Notification } from "@/lib/api";
import { useNotificationStream } from "@/lib/use-notification-stream";
import { useSession } from "@/lib/session";

function describeNotification(n: Notification): string {
  if (n.type === "DISCOVERY_RUN_STATUS_CHANGED") {
    const status = String(n.payload.status ?? "").toLowerCase().replace(/_/g, " ");
    return `Discovery run ${status}`;
  }
  return n.type.replace(/_/g, " ").toLowerCase();
}

export function NotificationBell() {
  const { session } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const workspaceId = session?.workspaceId ?? null;

  const refresh = useCallback(() => {
    if (!session) return;
    listNotifications({ workspaceId: session.workspaceId, userId: session.userId })
      .then(setNotifications)
      .catch(() => {});
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useNotificationStream(workspaceId, refresh);

  async function handleMarkRead(id: string) {
    if (!session) return;
    const previous = notifications;
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    try {
      await markNotificationRead(id, { workspaceId: session.workspaceId, userId: session.userId });
    } catch {
      setNotifications(previous);
    }
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-muted-foreground hover:bg-accent"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-md border bg-card shadow-lg">
            <div className="max-h-96 overflow-y-auto p-2">
              {notifications.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">No notifications yet.</p>
              )}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.readAt && handleMarkRead(n.id)}
                  className={`block w-full rounded-md p-2 text-left text-sm capitalize hover:bg-accent ${n.readAt ? "text-muted-foreground" : "font-medium"}`}
                >
                  {describeNotification(n)}
                  <div className="text-xs normal-case text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
