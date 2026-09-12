import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RoundPlanner } from "./round-planner";
import { ApiError } from "@/lib/api";

const suggestRoundPlan = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    suggestRoundPlan: (...args: unknown[]) => suggestRoundPlan(...args),
  };
});

describe("RoundPlanner", () => {
  beforeEach(() => {
    suggestRoundPlan.mockReset();
  });

  it("is collapsed by default", () => {
    render(<RoundPlanner />);
    expect(screen.queryByLabelText(/round size/i)).not.toBeInTheDocument();
  });

  it("suggests a target list size once expanded and submitted", async () => {
    suggestRoundPlan.mockResolvedValue({
      stage: "series-a",
      roundSizeUsd: 12_000_000,
      targetListSize: { min: 60, max: 120, recommended: 80 },
      rationale: "Series A investors are more selective.",
    });

    render(<RoundPlanner />);
    fireEvent.click(screen.getByText(/not sure how many investors/i));

    fireEvent.change(screen.getByLabelText(/stage/i), { target: { value: "series-a" } });
    fireEvent.change(screen.getByLabelText(/round size/i), { target: { value: "12000000" } });
    fireEvent.click(screen.getByRole("button", { name: /suggest/i }));

    await waitFor(() =>
      expect(suggestRoundPlan).toHaveBeenCalledWith({ stage: "series-a", roundSizeUsd: 12_000_000 })
    );
    expect(await screen.findByText(/target 80 investors \(60-120 range\)/i)).toBeInTheDocument();
    expect(screen.getByText("Series A investors are more selective.")).toBeInTheDocument();
  });

  it("shows an error message when the API call fails", async () => {
    suggestRoundPlan.mockRejectedValue(new ApiError(400, "Unknown stage"));

    render(<RoundPlanner />);
    fireEvent.click(screen.getByText(/not sure how many investors/i));
    fireEvent.change(screen.getByLabelText(/round size/i), { target: { value: "1000000" } });
    fireEvent.click(screen.getByRole("button", { name: /suggest/i }));

    expect(await screen.findByText("Unknown stage")).toBeInTheDocument();
  });
});
