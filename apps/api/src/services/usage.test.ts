import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "../test/db.js";
import { recordUsageIfAllowed, getUsageSummary, UsageLimitExceededError, WorkspaceNotFoundForUsageError } from "./usage.js";

describe("usage service (integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function makeWorkspace(usageLimit: number) {
    const user = await testPrisma.user.create({ data: { email: `usage-${Date.now()}-${Math.random()}@integration-test.dev`, role: "FOUNDER" } });
    return testPrisma.workspace.create({
      data: { name: "Usage Test WS", slug: `usage-ws-${Date.now()}-${Math.random()}`, ownerId: user.id, usageLimit },
    });
  }

  it("records usage while under the limit", async () => {
    const workspace = await makeWorkspace(3);

    await recordUsageIfAllowed(testPrisma, { workspaceId: workspace.id, type: "SEARCH" });
    await recordUsageIfAllowed(testPrisma, { workspaceId: workspace.id, type: "SEARCH" });

    const summary = await getUsageSummary(testPrisma, workspace.id);
    expect(summary).toMatchObject({ limit: 3, used: 2, remaining: 1 });
  });

  it("throws UsageLimitExceededError and records nothing once the limit is reached", async () => {
    const workspace = await makeWorkspace(1);

    await recordUsageIfAllowed(testPrisma, { workspaceId: workspace.id, type: "SEARCH" });
    await expect(recordUsageIfAllowed(testPrisma, { workspaceId: workspace.id, type: "SEARCH" })).rejects.toThrow(
      UsageLimitExceededError
    );

    const summary = await getUsageSummary(testPrisma, workspace.id);
    expect(summary.used).toBe(1);
  });

  it("rejects a costUnits request that would push usage over the limit, even partially", async () => {
    const workspace = await makeWorkspace(5);
    await recordUsageIfAllowed(testPrisma, { workspaceId: workspace.id, type: "EXPORT", costUnits: 3 });

    await expect(
      recordUsageIfAllowed(testPrisma, { workspaceId: workspace.id, type: "EXPORT", costUnits: 3 })
    ).rejects.toThrow(UsageLimitExceededError);

    const summary = await getUsageSummary(testPrisma, workspace.id);
    expect(summary.used).toBe(3);
  });

  it("throws WorkspaceNotFoundForUsageError for an unknown workspace", async () => {
    await expect(recordUsageIfAllowed(testPrisma, { workspaceId: "does-not-exist", type: "SEARCH" })).rejects.toThrow(
      WorkspaceNotFoundForUsageError
    );
  });

  it("serializes concurrent requests for the same workspace so the limit is never overshot", async () => {
    const workspace = await makeWorkspace(5);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => recordUsageIfAllowed(testPrisma, { workspaceId: workspace.id, type: "SEARCH" }))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(5);
    expect(failed).toHaveLength(5);

    const summary = await getUsageSummary(testPrisma, workspace.id);
    expect(summary.used).toBe(5);
  });
});
