"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { useNotificationStream } from "@/lib/use-notification-stream";
import { Badge } from "@/components/ui/badge";
import type { Notification } from "@/lib/types";

function describe(n: Notification): string {
  if (n.type === "DISCOVERY_RUN_STATUS_CHANGED") {
    return `Discovery run ${n.payload.status ?? ""}`.trim();
  }
  return n.type.replaceAll("_", " ").toLowerCase();
}

export function NotificationBell() {
  const { currentWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const queryKey = ["notifications", currentWorkspaceId];

  const { data: notifications = [] } = useQuery({
    queryKey,
    queryFn: () => api.listNotifications(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const onNotification = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["notifications", currentWorkspaceId] });
  }, [queryClient, currentWorkspaceId]);

  useNotificationStream(currentWorkspaceId, onNotification);

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

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
          <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 min-w-4 justify-center p-0 text-[10px]">
            {unreadCount}
          </Badge>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-md border bg-card shadow-lg">
          <div className="max-h-96 overflow-y-auto p-2">
            {notifications.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No notifications yet.</p>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => !n.readAt && markReadMutation.mutate(n.id)}
                className={`block w-full rounded-md p-2 text-left text-sm hover:bg-accent ${n.readAt ? "text-muted-foreground" : "font-medium"}`}
              >
                {describe(n)}
                <div className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
