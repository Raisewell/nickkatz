import { describe, it, expect, vi, beforeEach } from "vitest";
import { scoreThesisMatchBatch } from "./thesis-match.js";

const mockCreate = vi.fn();

vi.mock("../lib/anthropic.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/anthropic.js")>("../lib/anthropic.js");
  return {
    ...actual,
    getAnthropicClient: () => ({ messages: { create: mockCreate } }),
    getAnthropicModel: () => "claude-sonnet-4-6",
  };
});

function fakePrisma() {
  return {
    thesisMatchScore: { upsert: vi.fn() },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

describe("scoreThesisMatchBatch", () => {
  let prisma: ReturnType<typeof fakePrisma>;

  beforeEach(() => {
    mockCreate.mockReset();
    prisma = fakePrisma();
  });

  it("upserts one cache row per investor from a valid batched response", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            results: [
              { investorId: "inv_1", score: 90, evidence: "Thesis explicitly mentions embedded fintech" },
              { investorId: "inv_2", score: 10, evidence: "No overlap with sector" },
            ],
          }),
        },
      ],
    });

    await scoreThesisMatchBatch(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      [
        { id: "inv_1", thesis: "We back embedded fintech." },
        { id: "inv_2", thesis: "We back healthtech." },
      ],
      { sectors: ["fintech"], keywords: [] },
      "hash123"
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.thesisMatchScore.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.thesisMatchScore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { investorId_queryHash: { investorId: "inv_1", queryHash: "hash123" } },
        create: expect.objectContaining({ score: 90 }),
      })
    );
  });

  it("strips markdown fences before parsing", async () => {
    const payload = JSON.stringify({ results: [{ investorId: "inv_1", score: 50, evidence: "ok" }] });
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "```json\n" + payload + "\n```" }] });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await scoreThesisMatchBatch(prisma as any, [{ id: "inv_1", thesis: "x" }], { sectors: [], keywords: [] }, "h2");

    expect(prisma.thesisMatchScore.upsert).toHaveBeenCalledTimes(1);
  });

  it("does not write to the cache when Claude returns invalid JSON", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "not json" }] });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await scoreThesisMatchBatch(prisma as any, [{ id: "inv_1", thesis: "x" }], { sectors: [], keywords: [] }, "h3");

    expect(prisma.thesisMatchScore.upsert).not.toHaveBeenCalled();
  });

  it("does not write to the cache when Claude fails after retries", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await scoreThesisMatchBatch(prisma as any, [{ id: "inv_1", thesis: "x" }], { sectors: [], keywords: [] }, "h4");

    expect(prisma.thesisMatchScore.upsert).not.toHaveBeenCalled();
  }, 10_000);

  it("ignores investor ids Claude hallucinates that weren't in the batch", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ results: [{ investorId: "unknown_id", score: 50, evidence: "x" }] }) }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await scoreThesisMatchBatch(prisma as any, [{ id: "inv_1", thesis: "x" }], { sectors: [], keywords: [] }, "h5");

    expect(prisma.thesisMatchScore.upsert).not.toHaveBeenCalled();
  });

  it("is a no-op when no investors are passed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await scoreThesisMatchBatch(prisma as any, [], { sectors: [], keywords: [] }, "h6");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
