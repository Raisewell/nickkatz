import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OutreachActionBar } from "./outreach-action-bar";
import { ApiError } from "@/lib/api";

const listOutreachDestinations = vi.fn();
const sendOutreach = vi.fn();
const exportOutreachCsv = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    listOutreachDestinations: (...args: unknown[]) => listOutreachDestinations(...args),
    sendOutreach: (...args: unknown[]) => sendOutreach(...args),
    exportOutreachCsv: (...args: unknown[]) => exportOutreachCsv(...args),
  };
});

vi.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { workspaceId: "ws_1", userId: "user_1", workspaceName: "Test WS", email: "a@b.com", companyOneLiner: null },
  }),
}));

describe("OutreachActionBar", () => {
  beforeEach(() => {
    listOutreachDestinations.mockReset();
    sendOutreach.mockReset();
    exportOutreachCsv.mockReset();
    listOutreachDestinations.mockResolvedValue([
      { key: "csv", name: "CSV Export", implemented: true },
      { key: "heyreach", name: "HeyReach", implemented: true },
      { key: "instantly", name: "Instantly", implemented: false },
    ]);
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("excludes csv from the destination dropdown, since it has its own export button", async () => {
    render(<OutreachActionBar leadIds={["lead_1"]} onClear={vi.fn()} />);
    await waitFor(() => expect(listOutreachDestinations).toHaveBeenCalled());

    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).not.toContain("CSV Export");
    expect(options).toContain("HeyReach");
  });

  it("disables Send until a HeyReach campaign ID is entered", async () => {
    render(<OutreachActionBar leadIds={["lead_1"]} onClear={vi.fn()} />);
    await screen.findByText("HeyReach");

    const sendButton = screen.getByRole("button", { name: /^send$/i });
    expect(sendButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/campaign id/i), { target: { value: "42" } });
    expect(sendButton).not.toBeDisabled();
  });

  it("reports the send result", async () => {
    sendOutreach.mockResolvedValue({ destination: "heyreach", succeeded: 1, failed: 0 });

    render(<OutreachActionBar leadIds={["lead_1"]} onClear={vi.fn()} />);
    await screen.findByText("HeyReach");

    fireEvent.change(screen.getByPlaceholderText(/campaign id/i), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(sendOutreach).toHaveBeenCalledWith({
        workspaceId: "ws_1",
        destination: "heyreach",
        leadIds: ["lead_1"],
        config: { campaignId: 42 },
      })
    );
    expect(await screen.findByText(/1 sent, 0 failed/i)).toBeInTheDocument();
  });

  it("exports to CSV via a direct download rather than the send endpoint", async () => {
    exportOutreachCsv.mockResolvedValue(new Blob(["csv"], { type: "text/csv" }));

    render(<OutreachActionBar leadIds={["lead_1", "lead_2"]} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /export to csv/i }));

    await waitFor(() =>
      expect(exportOutreachCsv).toHaveBeenCalledWith({ workspaceId: "ws_1", leadIds: ["lead_1", "lead_2"] })
    );
    expect(sendOutreach).not.toHaveBeenCalled();
  });

  it("shows an error message when send fails", async () => {
    sendOutreach.mockRejectedValue(new ApiError(400, "Unknown outreach destination"));

    render(<OutreachActionBar leadIds={["lead_1"]} onClear={vi.fn()} />);
    await screen.findByText("HeyReach");
    fireEvent.change(screen.getByPlaceholderText(/campaign id/i), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByText("Unknown outreach destination")).toBeInTheDocument();
  });

  it("calls onClear when Clear is clicked", () => {
    const onClear = vi.fn();
    render(<OutreachActionBar leadIds={["lead_1"]} onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClear).toHaveBeenCalled();
  });
});
