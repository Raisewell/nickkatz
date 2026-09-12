import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationBell } from "./notification-bell";

const listNotifications = vi.fn();
const markNotificationRead = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    listNotifications: (...args: unknown[]) => listNotifications(...args),
    markNotificationRead: (...args: unknown[]) => markNotificationRead(...args),
  };
});

// A module-level constant, not a fresh object literal per call: the real
// useSession() returns a stable context value across re-renders, and a
// fresh reference here would re-trigger NotificationBell's refresh effect
// (which depends on `session`) on every render, masking real behavior
// behind a refetch loop that only exists in the mock.
const mockSession = {
  workspaceId: "ws_1",
  userId: "user_1",
  workspaceName: "Test WS",
  email: "a@b.com",
  companyOneLiner: null,
};

vi.mock("@/lib/session", () => ({
  useSession: () => ({ session: mockSession }),
}));

// The SSE stream is covered in its own test file - stub it out here so this
// suite only exercises NotificationBell's own rendering/state logic.
vi.mock("@/lib/use-notification-stream", () => ({
  useNotificationStream: () => {},
}));

function notification(overrides: Partial<{ id: string; type: string; readAt: string | null }> = {}) {
  return {
    id: "n1",
    type: "DISCOVERY_RUN_STATUS_CHANGED",
    payload: { status: "completed" },
    createdAt: new Date("2026-01-01T00:00:00Z").toISOString(),
    readAt: null,
    ...overrides,
  };
}

describe("NotificationBell", () => {
  beforeEach(() => {
    listNotifications.mockReset();
    markNotificationRead.mockReset();
  });

  it("shows no unread badge when there are no unread notifications", async () => {
    listNotifications.mockResolvedValue([notification({ readAt: new Date().toISOString() })]);

    render(<NotificationBell />);

    await waitFor(() => expect(listNotifications).toHaveBeenCalled());
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("shows the unread count badge", async () => {
    listNotifications.mockResolvedValue([notification({ id: "n1" }), notification({ id: "n2" })]);

    render(<NotificationBell />);

    expect(await screen.findByText("2")).toBeInTheDocument();
  });

  it("opens the dropdown on click and lists notifications", async () => {
    listNotifications.mockResolvedValue([notification()]);

    render(<NotificationBell />);
    await waitFor(() => expect(listNotifications).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(await screen.findByText(/discovery run completed/i)).toBeInTheDocument();
  });

  it("marks a notification read optimistically and calls the API", async () => {
    listNotifications.mockResolvedValue([notification()]);
    markNotificationRead.mockResolvedValue(undefined);

    render(<NotificationBell />);
    await waitFor(() => expect(listNotifications).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    fireEvent.click(await screen.findByText(/discovery run completed/i));

    await waitFor(() =>
      expect(markNotificationRead).toHaveBeenCalledWith("n1", { workspaceId: "ws_1", userId: "user_1" })
    );
    // Badge disappears once the (only) unread notification is marked read.
    await waitFor(() => expect(screen.queryByText("1")).not.toBeInTheDocument());
  });

  it("rolls back the optimistic mark-read if the API call fails", async () => {
    listNotifications.mockResolvedValue([notification()]);
    markNotificationRead.mockRejectedValue(new Error("network error"));

    render(<NotificationBell />);
    await waitFor(() => expect(listNotifications).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(await screen.findByText(/discovery run completed/i));

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalled());
    // Badge count is restored once the mutation fails and state rolls back.
    expect(await screen.findByText("1")).toBeInTheDocument();
  });
});
