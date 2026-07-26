import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";

describe("POST /auth/dev-session (integration)", () => {
  let app: FastifyInstance;

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
  });

  it("creates a user and a first workspace on first call", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/dev-session",
      payload: { email: "new-founder@example.com", workspaceName: "Acme Inc", companyOneLiner: "Payments for SMBs" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workspaceName).toBe("Acme Inc");
    expect(body.companyOneLiner).toBe("Payments for SMBs");

    const workspace = await testPrisma.workspace.findUniqueOrThrow({ where: { id: body.workspaceId } });
    expect(workspace.ownerId).toBe(body.userId);
  });

  it("returns the same workspace on a repeat call for the same email", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/auth/dev-session",
      payload: { email: "repeat@example.com" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/auth/dev-session",
      payload: { email: "repeat@example.com" },
    });

    expect(first.json().workspaceId).toBe(second.json().workspaceId);
    expect(first.json().userId).toBe(second.json().userId);

    const workspaces = await testPrisma.workspace.findMany({ where: { ownerId: first.json().userId } });
    expect(workspaces).toHaveLength(1);
  });

  it("updates the workspace's companyOneLiner on a later call", async () => {
    await app.inject({ method: "POST", url: "/auth/dev-session", payload: { email: "updater@example.com" } });
    const res = await app.inject({
      method: "POST",
      url: "/auth/dev-session",
      payload: { email: "updater@example.com", companyOneLiner: "We build rockets" },
    });

    expect(res.json().companyOneLiner).toBe("We build rockets");
  });
});
