import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";
import { signTestToken } from "../test/auth.js";

describe("GET/POST /workspaces (integration)", () => {
  let app: FastifyInstance;
  let userId: string;
  let token: string;

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
    const user = await testPrisma.user.create({ data: { email: "ws-list@integration-test.dev", role: "FOUNDER" } });
    userId = user.id;
    token = await signTestToken(userId);
  });

  it("lists only workspaces the caller owns or is a member of", async () => {
    const owned = await testPrisma.workspace.create({
      data: { name: "Mine", slug: `mine-${Date.now()}`, ownerId: userId },
    });
    const otherOwner = await testPrisma.user.create({ data: { email: "other-owner@integration-test.dev", role: "FOUNDER" } });
    const memberOf = await testPrisma.workspace.create({
      data: { name: "Advisor Client", slug: `client-${Date.now()}`, ownerId: otherOwner.id },
    });
    await testPrisma.workspaceMember.create({ data: { workspaceId: memberOf.id, userId, role: "MEMBER" } });
    await testPrisma.workspace.create({
      data: { name: "Not Mine", slug: `not-mine-${Date.now()}`, ownerId: otherOwner.id },
    });

    const res = await app.inject({ method: "GET", url: "/workspaces", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const ids = res.json().map((w: { id: string }) => w.id);
    expect(ids.sort()).toEqual([owned.id, memberOf.id].sort());
  });

  it("rejects requests with no bearer token", async () => {
    const res = await app.inject({ method: "GET", url: "/workspaces" });
    expect(res.statusCode).toBe(401);
  });

  it("creates a workspace owned by the caller", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/workspaces",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "New Co", companyOneLiner: "Payments for SMBs" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("New Co");
    expect(body.ownerId).toBe(userId);
    expect(body.plan).toBe("free");

    const stored = await testPrisma.workspace.findUniqueOrThrow({ where: { id: body.id } });
    expect(stored.ownerId).toBe(userId);

    // Matches seed.ts's convention: the owner also gets an explicit
    // WorkspaceMember row, so GET /:id/members has one source of truth.
    const ownerMembership = await testPrisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: body.id, userId } },
    });
    expect(ownerMembership?.role).toBe("OWNER");
  });
});

describe("workspace data export/delete (integration)", () => {
  let app: FastifyInstance;
  let ownerId: string;
  let ownerToken: string;

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
    ownerToken = await signTestToken(ownerId);
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
      headers: { authorization: `Bearer ${ownerToken}` },
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
    const outsiderToken = await signTestToken(outsider.id);

    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspace.id}/export`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it("POST /workspaces/:id/delete-request permanently removes the workspace and cascades to its data", async () => {
    const { workspace, investor } = await seedWorkspaceWithData();

    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspace.id}/delete-request`,
      headers: { authorization: `Bearer ${ownerToken}` },
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
    const memberToken = await signTestToken(member.id);

    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspace.id}/delete-request`,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(await testPrisma.workspace.findUnique({ where: { id: workspace.id } })).not.toBeNull();
  });

  it("POST /workspaces/:id/delete-request 404s for a nonexistent workspace", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/workspaces/does-not-exist/delete-request",
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("workspace member management (integration)", () => {
  let app: FastifyInstance;
  let ownerId: string;
  let ownerToken: string;
  let workspaceId: string;

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
    const owner = await testPrisma.user.create({ data: { email: "team-owner@integration-test.dev", role: "FOUNDER" } });
    ownerId = owner.id;
    ownerToken = await signTestToken(ownerId);
    const workspace = await testPrisma.workspace.create({
      data: { name: "Team WS", slug: `team-ws-${Date.now()}`, ownerId },
    });
    workspaceId = workspace.id;
  });

  it("GET /workspaces/:id/members lists the owner plus any members", async () => {
    const advisor = await testPrisma.user.create({
      data: { email: "advisor@integration-test.dev", name: "Riley Advisor", role: "ADVISOR" },
    });
    await testPrisma.workspaceMember.create({ data: { workspaceId, userId: advisor.id, role: "ADVISOR" } });

    const res = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body.find((m: { userId: string }) => m.userId === ownerId)).toMatchObject({ role: "OWNER" });
    expect(body.find((m: { userId: string }) => m.userId === advisor.id)).toMatchObject({
      role: "ADVISOR",
      email: "advisor@integration-test.dev",
      name: "Riley Advisor",
    });
  });

  it("GET /workspaces/:id/members doesn't double-list an owner who also has an explicit membership row", async () => {
    // seed.ts's convention (and now POST /workspaces too): the owner gets
    // both `Workspace.ownerId` and an explicit OWNER-role WorkspaceMember row.
    await testPrisma.workspaceMember.create({ data: { workspaceId, userId: ownerId, role: "OWNER" } });

    const res = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ userId: ownerId, role: "OWNER" });
  });

  it("GET /workspaces/:id/members 403s for a non-member", async () => {
    const outsider = await testPrisma.user.create({ data: { email: "outsider-members@integration-test.dev", role: "FOUNDER" } });
    const outsiderToken = await signTestToken(outsider.id);

    const res = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("POST /workspaces/:id/members adds an existing user by email", async () => {
    await testPrisma.user.create({ data: { email: "new-member@integration-test.dev", name: "New Member", role: "FOUNDER" } });

    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: "new-member@integration-test.dev", role: "MEMBER" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ email: "new-member@integration-test.dev", role: "MEMBER" });

    const stored = await testPrisma.workspaceMember.findFirst({ where: { workspaceId } });
    expect(stored?.role).toBe("MEMBER");
  });

  it("POST /workspaces/:id/members 404s when no account exists for that email", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: "nobody@integration-test.dev" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /workspaces/:id/members 400s for a user who is already a member", async () => {
    const member = await testPrisma.user.create({ data: { email: "already-member@integration-test.dev", role: "FOUNDER" } });
    await testPrisma.workspaceMember.create({ data: { workspaceId, userId: member.id, role: "MEMBER" } });

    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: "already-member@integration-test.dev" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /workspaces/:id/members 403s when called by a non-owner", async () => {
    const member = await testPrisma.user.create({ data: { email: "not-owner@integration-test.dev", role: "FOUNDER" } });
    await testPrisma.workspaceMember.create({ data: { workspaceId, userId: member.id, role: "MEMBER" } });
    const memberToken = await signTestToken(member.id);
    await testPrisma.user.create({ data: { email: "target@integration-test.dev", role: "FOUNDER" } });

    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { email: "target@integration-test.dev" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("DELETE /workspaces/:id/members/:userId removes a member", async () => {
    const member = await testPrisma.user.create({ data: { email: "removable@integration-test.dev", role: "FOUNDER" } });
    await testPrisma.workspaceMember.create({ data: { workspaceId, userId: member.id, role: "MEMBER" } });

    const res = await app.inject({
      method: "DELETE",
      url: `/workspaces/${workspaceId}/members/${member.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(204);
    expect(
      await testPrisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: member.id } } })
    ).toBeNull();
  });

  it("DELETE /workspaces/:id/members/:userId refuses to remove the owner", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/workspaces/${workspaceId}/members/${ownerId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /workspaces/:id/members/:userId 404s for someone who isn't a member", async () => {
    const notAMember = await testPrisma.user.create({ data: { email: "never-joined@integration-test.dev", role: "FOUNDER" } });

    const res = await app.inject({
      method: "DELETE",
      url: `/workspaces/${workspaceId}/members/${notAMember.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
