"use client";

import { useEffect } from "react";
import { getApiToken } from "./api-token";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Subscribes to GET /notifications/stream and calls onNotification for
 * each `event: notification` frame. Uses fetch + a manual SSE parser rather
 * than the native EventSource API, which can't set an Authorization header -
 * every other request in this app authenticates the same way (see api.ts),
 * so this keeps that consistent instead of punching a token-in-URL hole
 * into the API just for this one endpoint. */
export function useNotificationStream(workspaceId: string | null, onNotification: () => void) {
  useEffect(() => {
    if (!workspaceId) return;

    const controller = new AbortController();

    (async () => {
      const token = await getApiToken();
      let res: Response;
      try {
        res = await fetch(`${API_URL}/notifications/stream?workspaceId=${encodeURIComponent(workspaceId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
      } catch {
        return;
      }
      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          if (frame.includes("event: notification")) onNotification();
        }
      }
    })().catch(() => {});

    return () => controller.abort();
  }, [workspaceId, onNotification]);
}
