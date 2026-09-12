import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useNotificationStream } from "./use-notification-stream";

vi.mock("./api-token", () => ({
  getApiToken: vi.fn().mockResolvedValue("test-token"),
}));

function sseResponse(frames: string[]) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("useNotificationStream", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when workspaceId is null", () => {
    const onNotification = vi.fn();
    renderHook(() => useNotificationStream(null, onNotification));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches the stream with a bearer token and calls onNotification for each notification frame", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse(["event: notification\ndata: {}\n\n", "event: ping\ndata: {}\n\n"])
    );
    const onNotification = vi.fn();

    renderHook(() => useNotificationStream("ws_1", onNotification));

    await waitFor(() => expect(onNotification).toHaveBeenCalledTimes(1));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/notifications/stream?workspaceId=ws_1"),
      expect.objectContaining({ headers: { Authorization: "Bearer test-token" } })
    );
  });

  it("calls onNotification once per notification frame across multiple", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse(["event: notification\ndata: {}\n\n", "event: notification\ndata: {}\n\n"])
    );
    const onNotification = vi.fn();

    renderHook(() => useNotificationStream("ws_1", onNotification));

    await waitFor(() => expect(onNotification).toHaveBeenCalledTimes(2));
  });

  it("does not throw when the fetch itself rejects", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const onNotification = vi.fn();

    renderHook(() => useNotificationStream("ws_1", onNotification));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(onNotification).not.toHaveBeenCalled();
  });

  it("does not throw when the response is not ok", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(null, { status: 401 }));
    const onNotification = vi.fn();

    renderHook(() => useNotificationStream("ws_1", onNotification));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(onNotification).not.toHaveBeenCalled();
  });
});
