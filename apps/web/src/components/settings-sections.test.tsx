import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TeamSettings, DataSettings, WebhookSettings } from "./settings-sections";
import { ApiError } from "@/lib/api";

const listWorkspaceMembers = vi.fn();
const addWorkspaceMember = vi.fn();
const removeWorkspaceMember = vi.fn();
const exportWorkspaceData = vi.fn();
const deleteWorkspaceRequest = vi.fn();
const listWebhookEndpoints = vi.fn();
const createWebhookEndpoint = vi.fn();
const deleteWebhookEndpoint = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    listWorkspaceMembers: (...args: unknown[]) => listWorkspaceMembers(...args),
    addWorkspaceMember: (...args: unknown[]) => addWorkspaceMember(...args),
    removeWorkspaceMember: (...args: unknown[]) => removeWorkspaceMember(...args),
    exportWorkspaceData: (...args: unknown[]) => exportWorkspaceData(...args),
    deleteWorkspaceRequest: (...args: unknown[]) => deleteWorkspaceRequest(...args),
    listWebhookEndpoints: (...args: unknown[]) => listWebhookEndpoints(...args),
    createWebhookEndpoint: (...args: unknown[]) => createWebhookEndpoint(...args),
    deleteWebhookEndpoint: (...args: unknown[]) => deleteWebhookEndpoint(...args),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let isOwner = true;
const useSessionMock = vi.fn();
vi.mock("@/lib/session", () => ({
  useSession: () => useSessionMock(),
}));

function setSession() {
  useSessionMock.mockReturnValue({
    session: { workspaceId: "ws_1", userId: "user_1", workspaceName: "Test WS", email: "a@b.com", companyOneLiner: null },
    workspaces: [
      { id: "ws_1", name: "Test WS", slug: "test-ws", ownerId: isOwner ? "user_1" : "someone_else", plan: "free", companyOneLiner: null },
    ],
  });
}

describe("TeamSettings", () => {
  beforeEach(() => {
    isOwner = true;
    listWorkspaceMembers.mockReset();
    addWorkspaceMember.mockReset();
    removeWorkspaceMember.mockReset();
    setSession();
  });

  it("lists members and lets the owner invite a new one", async () => {
    listWorkspaceMembers.mockResolvedValue([
      { userId: "user_1", email: "a@b.com", name: "Jamie Founder", role: "OWNER" },
    ]);
    addWorkspaceMember.mockResolvedValue({ userId: "user_2", email: "new@b.com", name: null, role: "MEMBER" });

    render(<TeamSettings />);
    expect(await screen.findByText("Jamie Founder")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("teammate@company.com"), { target: { value: "new@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(addWorkspaceMember).toHaveBeenCalledWith("ws_1", { email: "new@b.com" }));
  });

  it("shows the API's error message when adding a member fails", async () => {
    listWorkspaceMembers.mockResolvedValue([{ userId: "user_1", email: "a@b.com", name: null, role: "OWNER" }]);
    addWorkspaceMember.mockRejectedValue(new ApiError(404, "No Raisely account found for that email"));

    render(<TeamSettings />);
    await screen.findByText("a@b.com");

    fireEvent.change(screen.getByPlaceholderText("teammate@company.com"), { target: { value: "ghost@nowhere.dev" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByText("No Raisely account found for that email")).toBeInTheDocument();
  });

  it("hides the invite form and remove buttons for a non-owner", async () => {
    isOwner = false;
    setSession();
    listWorkspaceMembers.mockResolvedValue([
      { userId: "user_1", email: "owner@b.com", name: null, role: "OWNER" },
      { userId: "user_2", email: "a@b.com", name: null, role: "MEMBER" },
    ]);

    render(<TeamSettings />);
    await screen.findByText("owner@b.com");

    expect(screen.queryByPlaceholderText("teammate@company.com")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only the workspace owner can add or remove/i)).toBeInTheDocument();
  });
});

describe("DataSettings", () => {
  beforeEach(() => {
    isOwner = true;
    exportWorkspaceData.mockReset();
    deleteWorkspaceRequest.mockReset();
    setSession();

    // jsdom doesn't implement these - the export handler calls them to trigger a browser download.
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("only enables Delete workspace once the confirmation text matches", async () => {
    render(<DataSettings />);
    const deleteButton = screen.getByRole("button", { name: /^delete workspace$/i });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/type "delete" to confirm/i), { target: { value: "delete" } });
    expect(deleteButton).not.toBeDisabled();
  });

  it("calls the export endpoint when Export data is clicked", async () => {
    exportWorkspaceData.mockResolvedValue({ workspace: {} });
    render(<DataSettings />);

    fireEvent.click(screen.getByRole("button", { name: /export data/i }));
    await waitFor(() => expect(exportWorkspaceData).toHaveBeenCalledWith("ws_1"));
  });

  it("hides the delete-workspace section for a non-owner", () => {
    isOwner = false;
    setSession();
    render(<DataSettings />);
    expect(screen.queryByRole("button", { name: /^delete workspace$/i })).not.toBeInTheDocument();
  });
});

describe("WebhookSettings", () => {
  beforeEach(() => {
    isOwner = true;
    listWebhookEndpoints.mockReset();
    createWebhookEndpoint.mockReset();
    deleteWebhookEndpoint.mockReset();
    setSession();
  });

  it("lists endpoints and shows the signing secret once after creating a new one", async () => {
    listWebhookEndpoints.mockResolvedValue([]);
    createWebhookEndpoint.mockResolvedValue({
      id: "wh_1",
      workspaceId: "ws_1",
      url: "https://example.com/hook",
      active: true,
      createdAt: new Date().toISOString(),
      secret: "whsec_abc123",
    });

    render(<WebhookSettings />);
    await waitFor(() => expect(listWebhookEndpoints).toHaveBeenCalledWith("ws_1"));

    fireEvent.change(screen.getByPlaceholderText(/your-app.com/i), { target: { value: "https://example.com/hook" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByText("whsec_abc123")).toBeInTheDocument();
    expect(createWebhookEndpoint).toHaveBeenCalledWith({ workspaceId: "ws_1", url: "https://example.com/hook" });
  });

  it("removes an endpoint", async () => {
    listWebhookEndpoints.mockResolvedValue([
      { id: "wh_1", workspaceId: "ws_1", url: "https://example.com/hook", active: true, createdAt: new Date().toISOString() },
    ]);
    deleteWebhookEndpoint.mockResolvedValue(undefined);

    render(<WebhookSettings />);
    await screen.findByText("https://example.com/hook");

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => expect(deleteWebhookEndpoint).toHaveBeenCalledWith("wh_1", { workspaceId: "ws_1" }));
  });
});
