import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { PipelineBoard } from "./pipeline-board";

const listPipelineLeads = vi.fn();
const updatePipelineStage = vi.fn();

vi.mock("@/lib/api", () => ({
  listPipelineLeads: (...args: unknown[]) => listPipelineLeads(...args),
  updatePipelineStage: (...args: unknown[]) => updatePipelineStage(...args),
  computeWarmPaths: vi.fn(),
  listWarmPaths: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { workspaceId: "ws_1", userId: "user_1", workspaceName: "Test WS", email: "a@b.com", companyOneLiner: null },
  }),
}));

function makeLead(overrides: Partial<{ id: string; pipelineStage: string; investorName: string }> = {}) {
  return {
    id: overrides.id ?? "lead_1",
    searchId: "search_1",
    investorId: "inv_1",
    investor: {
      id: "inv_1",
      name: overrides.investorName ?? "Acme Ventures",
      type: "VC" as const,
      thesis: null,
      sectors: [],
      stages: [],
      geographies: [],
      checkMin: null,
      checkMax: null,
      website: null,
      linkedinUrl: null,
    },
    fitScore: 80,
    fitReasons: null,
    tier: "A" as const,
    pipelineStage: overrides.pipelineStage ?? "IDENTIFIED",
    tags: [],
    bestWarmPath: null,
  };
}

describe("PipelineBoard", () => {
  beforeEach(() => {
    listPipelineLeads.mockReset();
    updatePipelineStage.mockReset();
  });

  it("shows an empty state when there are no leads", async () => {
    listPipelineLeads.mockResolvedValue([]);
    render(<PipelineBoard />);
    expect(await screen.findByText(/no leads yet/i)).toBeInTheDocument();
  });

  it("renders leads grouped under their pipeline stage column", async () => {
    listPipelineLeads.mockResolvedValue([makeLead({ id: "lead_1", pipelineStage: "IDENTIFIED", investorName: "Acme Ventures" })]);
    render(<PipelineBoard />);

    expect(await screen.findByText("Acme Ventures")).toBeInTheDocument();
    // "Identified"/"Contacted" also appear as <option> labels inside the lead's own stage
    // select, so scope to the column headings specifically. Each heading's accessible name
    // includes its lead-count badge too (e.g. "Identified1"), hence the prefix match.
    expect(screen.getByRole("heading", { name: /^Identified/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Contacted/ })).toBeInTheDocument();
  });

  it("rolls back the optimistic move if the API call fails", async () => {
    listPipelineLeads.mockResolvedValue([makeLead({ id: "lead_1", pipelineStage: "IDENTIFIED", investorName: "Acme Ventures" })]);
    updatePipelineStage.mockRejectedValue(new Error("network error"));

    render(<PipelineBoard />);
    await screen.findByText("Acme Ventures");

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "CONTACTED" } });

    await waitFor(() => expect(updatePipelineStage).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/couldn't move that lead/i)).toBeInTheDocument());
    // Rolled back to its original stage after the failed request.
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("IDENTIFIED");
  });
});
