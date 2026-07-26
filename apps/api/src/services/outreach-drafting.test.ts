import { describe, it, expect, vi, beforeEach } from "vitest";
import { draftOutreach } from "./outreach-drafting.js";

const mockCreate = vi.fn();

vi.mock("../lib/anthropic.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/anthropic.js")>("../lib/anthropic.js");
  return {
    ...actual,
    getAnthropicClient: () => ({ messages: { create: mockCreate } }),
    getAnthropicModel: () => "claude-sonnet-4-6",
  };
});

function fakeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead_1",
    investor: { name: "Acme Ventures", thesis: "We back seed fintech." },
    workspace: { companyOneLiner: "Payroll infra for SMBs" },
    fitReasons: {
      score: 84,
      components: [{ factor: "thesis_match", points: 30, max: 35, evidence: "Thesis mentions fintech" }],
      flags: [],
    },
    ...overrides,
  };
}

function fakePrisma(lead: ReturnType<typeof fakeLead>) {
  return {
    lead: { findUniqueOrThrow: vi.fn().mockResolvedValue(lead) },
    outreachDraft: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "draft_1", ...data })) },
  };
}

describe("draftOutreach", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("persists a Claude-generated draft, never sending anything", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            firstLine: "Noticed Acme backs seed fintech - we're building payroll infra for SMBs.",
            subject: "Quick intro",
            body: "Hi, ...",
          }),
        },
      ],
    });

    const lead = fakeLead();
    const prisma = fakePrisma(lead);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draft = await draftOutreach(prisma as any, { leadId: "lead_1" });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(prisma.outreachDraft.create).toHaveBeenCalledWith({
      data: {
        leadId: "lead_1",
        firstLine: "Noticed Acme backs seed fintech - we're building payroll infra for SMBs.",
        subject: "Quick intro",
        body: "Hi, ...",
      },
    });
    expect(draft.id).toBe("draft_1");
  });

  it("uses the workspace's saved companyOneLiner when none is passed explicitly", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ firstLine: "x", subject: "y", body: "z" }) }],
    });

    const lead = fakeLead();
    const prisma = fakePrisma(lead);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await draftOutreach(prisma as any, { leadId: "lead_1" });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("Payroll infra for SMBs");
  });

  it("falls back to a templated draft (never fabricated) when Claude fails", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    const lead = fakeLead();
    const prisma = fakePrisma(lead);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draft = await draftOutreach(prisma as any, { leadId: "lead_1" });

    expect(draft.firstLine).toContain("Acme Ventures");
    expect(draft.firstLine).toContain("Payroll infra for SMBs");
  }, 10_000);

  it("falls back to a generic phrase when there's no company one-liner anywhere", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    const lead = fakeLead({ workspace: { companyOneLiner: null } });
    const prisma = fakePrisma(lead);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draft = await draftOutreach(prisma as any, { leadId: "lead_1" });
    expect(draft.firstLine).toContain("our company");
  }, 10_000);
});
