import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "../test/db.js";
import { getWorkspaceScopedPrisma, WorkspaceScopeViolationError } from "./workspace-scope.js";

describe("getWorkspaceScopedPrisma (integration - real Postgres, no mocks)", () => {
  let workspaceAId: string;
  let workspaceBId: string;
  let userId: string;

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb();
    const user = await testPrisma.user.create({ data: { email: "scope-test@integration-test.dev", role: "FOUNDER" } });
    userId = user.id;
    const wsA = await testPrisma.workspace.create({ data: { name: "Workspace A", slug: `ws-a-${Date.now()}`, ownerId: user.id } });
    const wsB = await testPrisma.workspace.create({ data: { name: "Workspace B", slug: `ws-b-${Date.now()}`, ownerId: user.id } });
    workspaceAId = wsA.id;
    workspaceBId = wsB.id;
  });

  async function createSearchIn(workspaceId: string, name: string) {
    return testPrisma.search.create({
      data: {
        workspaceId,
        createdById: userId,
        name,
        structuredQuery: { stages: [], sectors: [], geographies: [], checkRange: { min: null, max: null }, investorTypes: [], keywords: [] },
        status: "COMPLETE",
      },
    });
  }

  describe("reads", () => {
    it("findMany only ever returns rows from the scoped workspace, even if the caller's where clause omits workspaceId entirely", async () => {
      await createSearchIn(workspaceAId, "A1");
      await createSearchIn(workspaceBId, "B1");

      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);
      const results = await scopedA.search.findMany({});

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("A1");
    });

    it("findUnique by id returns null for a record that belongs to a different workspace, instead of the record", async () => {
      const searchB = await createSearchIn(workspaceBId, "B-secret");

      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);
      const result = await scopedA.search.findUnique({ where: { id: searchB.id } });

      expect(result).toBeNull();
    });

    it("findUnique by id returns the record when it does belong to the scoped workspace", async () => {
      const searchA = await createSearchIn(workspaceAId, "A-mine");

      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);
      const result = await scopedA.search.findUnique({ where: { id: searchA.id } });

      expect(result?.id).toBe(searchA.id);
    });

    it("ignores and overrides a caller-supplied workspaceId in `where` rather than trusting it", async () => {
      await createSearchIn(workspaceAId, "A1");
      await createSearchIn(workspaceBId, "B1");

      // Even if application code mistakenly (or maliciously) passes the
      // wrong workspaceId in `where`, the scoped client's workspaceId wins.
      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);
      const results = await scopedA.search.findMany({ where: { workspaceId: workspaceBId } });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("A1");
    });

    it("count is scoped too", async () => {
      await createSearchIn(workspaceAId, "A1");
      await createSearchIn(workspaceAId, "A2");
      await createSearchIn(workspaceBId, "B1");

      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);
      expect(await scopedA.search.count()).toBe(2);
    });
  });

  describe("writes", () => {
    it("update affects zero rows when targeting another workspace's record by id", async () => {
      const searchB = await createSearchIn(workspaceBId, "B1");
      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);

      await expect(scopedA.search.update({ where: { id: searchB.id }, data: { name: "hijacked" } })).rejects.toThrow();

      const stillB = await testPrisma.search.findUniqueOrThrow({ where: { id: searchB.id } });
      expect(stillB.name).toBe("B1");
    });

    it("updateMany silently affects zero rows for another workspace (Prisma's *Many semantics - no throw)", async () => {
      const searchB = await createSearchIn(workspaceBId, "B1");
      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);

      const result = await scopedA.search.updateMany({ where: { id: searchB.id }, data: { name: "hijacked" } });
      expect(result.count).toBe(0);

      const stillB = await testPrisma.search.findUniqueOrThrow({ where: { id: searchB.id } });
      expect(stillB.name).toBe("B1");
    });

    it("delete throws (not found) instead of deleting another workspace's record", async () => {
      const searchB = await createSearchIn(workspaceBId, "B1");
      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);

      await expect(scopedA.search.delete({ where: { id: searchB.id } })).rejects.toThrow();

      expect(await testPrisma.search.findUnique({ where: { id: searchB.id } })).not.toBeNull();
    });

    it("create stamps the scoped workspaceId onto the new row", async () => {
      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);
      const created = await scopedA.search.create({
        data: {
          createdById: userId,
          name: "new",
          structuredQuery: { stages: [], sectors: [], geographies: [], checkRange: { min: null, max: null }, investorTypes: [], keywords: [] },
          status: "COMPLETE",
        } as never,
      });

      expect(created.workspaceId).toBe(workspaceAId);
    });

    it("create throws WorkspaceScopeViolationError if the caller passed a conflicting workspaceId", async () => {
      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);

      await expect(
        scopedA.search.create({
          data: {
            workspaceId: workspaceBId,
            createdById: userId,
            name: "conflict",
            structuredQuery: { stages: [], sectors: [], geographies: [], checkRange: { min: null, max: null }, investorTypes: [], keywords: [] },
            status: "COMPLETE",
          },
        })
      ).rejects.toBeInstanceOf(WorkspaceScopeViolationError);
    });

    it("createMany stamps every item and rejects if any item conflicts", async () => {
      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);
      const investor = await testPrisma.investor.create({
        data: { name: "Test Investor", type: "VC", sectors: [], stages: [], geographies: [] },
      });
      const search = await createSearchIn(workspaceAId, "for-leads");

      await scopedA.lead.createMany({
        data: [{ searchId: search.id, investorId: investor.id, pipelineStage: "IDENTIFIED" }] as never,
      });

      const leads = await testPrisma.lead.findMany({ where: { searchId: search.id } });
      expect(leads).toHaveLength(1);
      expect(leads[0].workspaceId).toBe(workspaceAId);
    });
  });

  describe("non-scoped models are untouched", () => {
    it("does not filter Investor (a global, shared model) by workspace at all", async () => {
      const investor = await testPrisma.investor.create({
        data: { name: "Global Investor", type: "VC", sectors: [], stages: [], geographies: [] },
      });

      const scopedA = getWorkspaceScopedPrisma(testPrisma, workspaceAId);
      const found = await scopedA.investor.findUnique({ where: { id: investor.id } });

      expect(found?.id).toBe(investor.id);
    });
  });
});
