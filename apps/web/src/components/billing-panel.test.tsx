import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BillingPanel } from "./billing-panel";
import { ApiError } from "@/lib/api";

const getBillingSummary = vi.fn();
const getUsage = vi.fn();
const listPlans = vi.fn();
const createCheckoutSession = vi.fn();
const createPortalSession = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getBillingSummary: (...args: unknown[]) => getBillingSummary(...args),
    getUsage: (...args: unknown[]) => getUsage(...args),
    listPlans: (...args: unknown[]) => listPlans(...args),
    createCheckoutSession: (...args: unknown[]) => createCheckoutSession(...args),
    createPortalSession: (...args: unknown[]) => createPortalSession(...args),
  };
});

vi.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { workspaceId: "ws_1", userId: "user_1", workspaceName: "Test WS", email: "a@b.com", companyOneLiner: null },
  }),
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("BillingPanel", () => {
  beforeEach(() => {
    getBillingSummary.mockReset();
    getUsage.mockReset();
    listPlans.mockReset();
    createCheckoutSession.mockReset();
    createPortalSession.mockReset();

    getUsage.mockResolvedValue({ limit: 50, used: 5, remaining: 45, periodStart: new Date().toISOString() });
    listPlans.mockResolvedValue({
      plans: [
        { id: "starter", label: "Starter", usageLimit: 250 },
        { id: "pro", label: "Pro", usageLimit: 1000 },
      ],
    });
  });

  it("shows the current plan and usage", async () => {
    getBillingSummary.mockResolvedValue({
      plan: "free",
      planLabel: "Free",
      usageLimit: 50,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      hasStripeCustomer: false,
    });

    renderWithQueryClient(<BillingPanel />);

    expect(await screen.findByText("Free")).toBeInTheDocument();
    expect(await screen.findByText("5 / 50")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upgrade to starter/i })).toBeInTheDocument();
    // No Stripe customer yet - "Manage billing" shouldn't be offered.
    expect(screen.queryByRole("button", { name: /manage billing/i })).not.toBeInTheDocument();
  });

  it("shows a specific message when checkout fails because Stripe isn't configured (503)", async () => {
    getBillingSummary.mockResolvedValue({
      plan: "free",
      planLabel: "Free",
      usageLimit: 50,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      hasStripeCustomer: false,
    });
    createCheckoutSession.mockRejectedValue(new ApiError(503, "Billing is not configured"));

    renderWithQueryClient(<BillingPanel />);
    const upgradeButton = await screen.findByRole("button", { name: /upgrade to starter/i });
    fireEvent.click(upgradeButton);

    expect(await screen.findByText(/billing isn't configured yet/i)).toBeInTheDocument();
  });

  it("shows a generic error message for a non-503 checkout failure", async () => {
    getBillingSummary.mockResolvedValue({
      plan: "free",
      planLabel: "Free",
      usageLimit: 50,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      hasStripeCustomer: false,
    });
    createCheckoutSession.mockRejectedValue(new Error("boom"));

    renderWithQueryClient(<BillingPanel />);
    const upgradeButton = await screen.findByRole("button", { name: /upgrade to starter/i });
    fireEvent.click(upgradeButton);

    await waitFor(() => expect(screen.getByText(/couldn't start checkout/i)).toBeInTheDocument());
  });

  it("offers Manage billing once a Stripe customer exists", async () => {
    getBillingSummary.mockResolvedValue({
      plan: "starter",
      planLabel: "Starter",
      usageLimit: 250,
      subscriptionStatus: "ACTIVE",
      currentPeriodEnd: new Date("2026-09-01").toISOString(),
      hasStripeCustomer: true,
    });

    renderWithQueryClient(<BillingPanel />);

    expect(await screen.findByRole("button", { name: /manage billing/i })).toBeInTheDocument();
    expect(screen.getByText(/renews/i)).toBeInTheDocument();
  });
});
