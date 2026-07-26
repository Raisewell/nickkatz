import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "../test/db.js";
import {
  assertWorkspaceMembership,
  resolveWorkspaceAccess,
  WorkspaceForbiddenError,
  WorkspaceNotFoundError,
} from "./workspace-auth.js";

describe("assertWorkspaceMembership (integration - real Postgres)", () => {
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let workspaceId: string;

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb();
    const owner = await testPrisma.user.create({ data: { email: "owner@integration-test.dev", role: "FOUNDER" } });
    const member = await testPrisma.user.create({ data: { email: "member@integration-test.dev", role: "ADVISOR" } });
    const outsider = await testPrisma.user.create({ data: { email: "outsider@integration-test.dev", role: "FOUNDER" } });
    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;

    const workspace = await testPrisma.workspace.create({
      data: {
        name: "Membership Test Workspace",
        slug: `membership-ws-${Date.now()}`,
        ownerId: owner.id,
        members: { create: [{ userId: member.id, role: "ADVISOR" }] },
      },
    });
    workspaceId = workspace.id;
  });

  it("allows the workspace owner", async () => {
    await expect(assertWorkspaceMembership(testPrisma, workspaceId, ownerId)).resolves.toBeUndefined();
  });

  it("allows a user with a WorkspaceMember row", async () => {
    await expect(assertWorkspaceMembership(testPrisma, workspaceId, memberId)).resolves.toBeUndefined();
  });

  it("rejects a user with no relationship to the workspace", async () => {
    await expect(assertWorkspaceMembership(testPrisma, workspaceId, outsiderId)).rejects.toBeInstanceOf(
      WorkspaceForbiddenError
    );
  });

  it("rejects a nonexistent workspace with a distinct error (not a false-allow)", async () => {
    await expect(assertWorkspaceMembership(testPrisma, "nonexistent_ws", ownerId)).rejects.toBeInstanceOf(
      WorkspaceNotFoundError
    );
  });

  it("rejects a user who is a member of a DIFFERENT workspace, not this one", async () => {
    const otherWorkspace = await testPrisma.workspace.create({
      data: { name: "Other Workspace", slug: `other-ws-${Date.now()}`, ownerId: outsiderId },
    });
    // outsiderId owns otherWorkspace, but has no relationship to `workspaceId`.
    await expect(assertWorkspaceMembership(testPrisma, workspaceId, outsiderId)).rejects.toBeInstanceOf(
      WorkspaceForbiddenError
    );
    await expect(assertWorkspaceMembership(testPrisma, otherWorkspace.id, outsiderId)).resolves.toBeUndefined();
  });

  describe("resolveWorkspaceAccess", () => {
    it("returns a scoped client after a successful membership check", async () => {
      const scoped = await resolveWorkspaceAccess(testPrisma, workspaceId, ownerId);
      const search = await scoped.search.create({
        data: {
          createdById: ownerId,
          structuredQuery: { stages: [], sectors: [], geographies: [], checkRange: { min: null, max: null }, investorTypes: [], keywords: [] },
          status: "COMPLETE",
        } as never,
      });
      expect(search.workspaceId).toBe(workspaceId);
    });

    it("throws before returning any client for a non-member", async () => {
      await expect(resolveWorkspaceAccess(testPrisma, workspaceId, outsiderId)).rejects.toBeInstanceOf(
        WorkspaceForbiddenError
      );
    });
  });
});
