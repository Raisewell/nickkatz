import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";
import { signTestToken } from "../test/auth.js";
import type { InjectOptions } from "light-my-request";

describe("exclusion lists (integration)", () => {
  let app: FastifyInstance;
  let workspaceId: string;
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

  function authed(opts: InjectOptions) {
    return app.inject({ ...opts, headers: { authorization: `Bearer ${token}`, ...opts.headers } });
  }

  beforeEach(async () => {
    await resetDb();
    const user = await testPrisma.user.create({
      data: { email: "founder2@integration-test.dev", role: "FOUNDER" },
    });
    userId = user.id;
    token = await signTestToken(userId);
    const workspace = await testPrisma.workspace.create({
      data: { name: "Exclusion Test Workspace", slug: `excl-ws-${Date.now()}`, ownerId: user.id },
    });
    workspaceId = workspace.id;
  });

  it("creates and lists exclusion lists for a workspace", async () => {
    const create = await authed({
      method: "POST",
      url: "/exclusion-lists",
      payload: { workspaceId, userId, name: "My connections" },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().entryCount).toBe(0);

    const list = await authed({
      method: "GET",
      url: `/exclusion-lists?workspaceId=${workspaceId}&userId=${userId}`,
    });
    expect(list.json()).toHaveLength(1);
  });

  it("uploads a LinkedIn Connections.csv export and creates entries", async () => {
    const created = await authed({
      method: "POST",
      url: "/exclusion-lists",
      payload: { workspaceId, userId, name: "LinkedIn connections" },
    });
    const listId = created.json().id;

    const csv = [
      "Notes:",
      '"Some preamble text LinkedIn adds to every export."',
      "",
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
      "Sam,Chen,https://www.linkedin.com/in/samchen,sam@example.com,Acme,Partner,1 Jan 2024",
    ].join("\n");

    const boundary = "----testboundary";
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="Connections.csv"\r\n` +
      `Content-Type: text/csv\r\n\r\n` +
      `${csv}\r\n` +
      `--${boundary}--\r\n`;

    const res = await authed({
      method: "POST",
      url: `/exclusion-lists/${listId}/upload?workspaceId=${workspaceId}&userId=${userId}`,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ detectedFormat: "linkedin_import", rowsParsed: 1, entriesCreated: 1 });

    const entries = await testPrisma.exclusionEntry.findMany({ where: { exclusionListId: listId } });
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("Sam Chen");
    expect(entries[0].source).toBe("LINKEDIN_IMPORT");
  });
});
