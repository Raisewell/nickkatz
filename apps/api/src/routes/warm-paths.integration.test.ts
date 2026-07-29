import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { InjectOptions } from "light-my-request";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";
import { signTestToken } from "../test/auth.js";

describe("warm paths (integration)", () => {
  let app: FastifyInstance;
  let workspaceId: string;
  let userId: string;
  let token: string;
  let investorId: string;
  let contactId: string;
  let searchId: string;
  let leadId: string;

  function authed(opts: InjectOptions) {
    return app.inject({ ...opts, headers: { authorization: `Bearer ${token}`, ...opts.headers } });
  }

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

    const user = await testPrisma.user.create({ data: { email: "founder-wp@integration-test.dev", role: "FOUNDER" } });
    userId = user.id;
    token = await signTestToken(userId);
    const workspace = await testPrisma.workspace.create({
      data: { name: "Warm Path Test Workspace", slug: `wp-ws-${Date.now()}`, ownerId: user.id },
    });
    workspaceId = workspace.id;

    const investor = await testPrisma.investor.create({
      data: {
        name: "Warm Path Capital",
        type: "VC",
        sectors: ["fintech"],
        stages: ["seed"],
        geographies: [],
        contacts: { create: [{ name: "Sam Chen", email: "sam@warmpath.vc", linkedinUrl: "https://www.linkedin.com/in/samchen" }] },
      },
      include: { contacts: true },
    });
    investorId = investor.id;
    contactId = investor.contacts[0].id;

    const search = await testPrisma.search.create({
      data: {
        workspaceId,
        createdById: userId,
        structuredQuery: { stages: [], sectors: [], geographies: [], checkRange: { min: null, max: null }, investorTypes: [], keywords: [] },
        status: "COMPLETE",
      },
    });
    searchId = search.id;

    const lead = await testPrisma.lead.create({
      data: { workspaceId, searchId, investorId, fitScore: 70, pipelineStage: "IDENTIFIED" },
    });
    leadId = lead.id;
  });

  it("imports LinkedIn connections and computes a direct warm path with a recency-based strength score", async () => {
    const csv = [
      "Notes:",
      '"preamble"',
      "",
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
      "Sam,Chen,https://www.linkedin.com/in/samchen,sam@warmpath.vc,Warm Path Capital,Partner,1 Jan 2026",
    ].join("\n");

    const boundary = "----wpboundary";
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="Connections.csv"\r\n` +
      `Content-Type: text/csv\r\n\r\n` +
      `${csv}\r\n` +
      `--${boundary}--\r\n`;

    const importRes = await authed({
      method: "POST",
      url: `/network-contacts/import?workspaceId=${workspaceId}`,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(importRes.statusCode).toBe(200);
    expect(importRes.json()).toEqual({ detectedFormat: "linkedin_import", rowsParsed: 1, contactsCreated: 1 });

    const computeRes = await authed({
      method: "POST",
      url: "/warm-paths/compute",
      payload: { workspaceId, leadId },
    });
    expect(computeRes.statusCode).toBe(200);
    expect(computeRes.json()).toEqual({ created: 1 });

    const listRes = await authed({ method: "GET", url: `/warm-paths?leadId=${leadId}` });
    const warmPaths = listRes.json();
    expect(warmPaths).toHaveLength(1);
    expect(warmPaths[0]).toMatchObject({ targetContactId: contactId, verified: true, strengthScore: 90 });

    // Best warm path surfaces on the lead card via the search detail response.
    const searchDetail = await authed({ method: "GET", url: `/searches/${searchId}` });
    const leadCard = searchDetail.json().leads.find((l: { id: string }) => l.id === leadId);
    expect(leadCard.bestWarmPath).toMatchObject({ targetContactId: contactId, verified: true, strengthScore: 90 });
  });

  it("marks a warm path unverified when there's no recency signal", async () => {
    await testPrisma.networkContact.create({
      data: { workspaceId, name: "Sam Chen", email: "sam@warmpath.vc", source: "CSV_IMPORT", connectedAt: null },
    });

    await authed({ method: "POST", url: "/warm-paths/compute", payload: { workspaceId, leadId } });

    const listRes = await authed({ method: "GET", url: `/warm-paths?leadId=${leadId}` });
    expect(listRes.json()[0]).toMatchObject({ verified: false, strengthScore: null });
  });

  it("allows manually recording a warm path via a free-text mutual name", async () => {
    const res = await authed({
      method: "POST",
      url: "/warm-paths",
      payload: {
        workspaceId,
        leadId,
        targetContactId: contactId,
        mutualName: "Jordan (ex-colleague, knows the partner)",
        strengthScore: 60,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ verified: false, mutualName: "Jordan (ex-colleague, knows the partner)" });
  });
});
