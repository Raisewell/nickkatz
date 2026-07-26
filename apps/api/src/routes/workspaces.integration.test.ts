import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";

describe("workspace data export/delete (integration)", () => {
  let app: FastifyInstance;
  let ownerId: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb();
    const owner = await testPrisma.user.create({ data: { email: "owner@integration-test.dev", role: "FOUNDER" } });
    ownerId = owner.id;
  });

  async function seedWorkspaceWithData() {
    const workspace = await testPrisma.workspace.create({
      data: { name: "Export WS", slug: `export-ws-${Date.now()}`, ownerId },
    });
    const investor = await testPrisma.investor.create({ data: { name: "Test Fund", type: "VC" } });
    const search = await testPrisma.search.create({
      data: { workspaceId: workspace.id, createdById: ownerId, structuredQuery: {} },
    });
    await testPrisma.lead.create({ data: { workspaceId: workspace.id, searchId: search.id, investorId: investor.id } });
    await testPrisma.webhookEndpoint.create({
      data: { workspaceId: workspace.id, url: "https://example.com/hook", secret: "super-secret-value" },
    });
    return { workspace, investor };
  }

  it("POST /workspaces/:id/export returns the workspace's data and never includes webhook secrets", async () => {
    const { workspace } = await seedWorkspaceWithData();

    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspace.id}/export`,
      payload: { userId: ownerId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workspace.id).toBe(workspace.id);
    expect(body.workspace.searches).toHaveLength(1);
    expect(body.workspace.searches[0].leads).toHaveLength(1);
    expect(body.workspace.webhookEndpoints).toHaveLength(1);
    expect(body.workspace.webhookEndpoints[0].secret).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("super-secret-value");
  });

  it("POST /workspaces/:id/export 403s for a non-member", async () => {
    const { workspace } = await seedWorkspaceWithData();
    const outsider = await testPrisma.user.create({ data: { email: "outsider-export@integration-test.dev", role: "FOUNDER" } });

    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspace.id}/export`,
      payload: { userId: outsider.id },
    });

    expect(res.statusCode).toBe(403);
  });

  it("POST /workspaces/:id/delete-request permanently removes the workspace and cascades to its data", async () => {
    const { workspace, investor } = await seedWorkspaceWithData();

    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspace.id}/delete-request`,
      payload: { userId: ownerId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "deleted", workspaceId: workspace.id });

    expect(await testPrisma.workspace.findUnique({ where: { id: workspace.id } })).toBeNull();
    expect(await testPrisma.search.findMany({ where: { workspaceId: workspace.id } })).toHaveLength(0);
    expect(await testPrisma.lead.findMany({ where: { workspaceId: workspace.id } })).toHaveLength(0);
    expect(await testPrisma.webhookEndpoint.findMany({ where: { workspaceId: workspace.id } })).toHaveLength(0);
    // Shared investor graph data is never touched by a workspace deletion.
    expect(await testPrisma.investor.findUnique({ where: { id: investor.id } })).not.toBeNull();
  });

  it("POST /workspaces/:id/delete-request 403s for a member who is not the owner", async () => {
    const { workspace } = await seedWorkspaceWithData();
    const member = await testPrisma.user.create({ data: { email: "member-not-owner@integration-test.dev", role: "FOUNDER" } });
    await testPrisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: member.id, role: "MEMBER" } });

    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspace.id}/delete-request`,
      payload: { userId: member.id },
    });

    expect(res.statusCode).toBe(403);
    expect(await testPrisma.workspace.findUnique({ where: { id: workspace.id } })).not.toBeNull();
  });

  it("POST /workspaces/:id/delete-request 404s for a nonexistent workspace", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/workspaces/does-not-exist/delete-request",
      payload: { userId: ownerId },
    });

    expect(res.statusCode).toBe(404);
  });
});
