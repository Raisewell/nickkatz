import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";
import { processDiscoveryRun, processDiscoveryApproval } from "../services/discovery.js";
import { getDiscoveryRunQueue, getDiscoveryApprovalQueue, closeDiscoveryQueues } from "../jobs/discovery-queue.js";
import { closeWebhookQueue } from "../jobs/webhook-queue.js";
import { startWebhookWorker } from "../jobs/webhook-worker.js";

describe("discovery run lifecycle (integration)", () => {
  let app: FastifyInstance;
  let workspaceId: string;
  let userId: string;
  let directInvestorId: string;
  let coInvestorId: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeDiscoveryQueues();
    await closeWebhookQueue();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb();

    const user = await testPrisma.user.create({ data: { email: "founder4@integration-test.dev", role: "FOUNDER" } });
    userId = user.id;
    const workspace = await testPrisma.workspace.create({
      data: { name: "Discovery Test Workspace", slug: `discovery-ws-${Date.now()}`, ownerId: user.id },
    });
    workspaceId = workspace.id;

    const direct = await testPrisma.investor.create({
      data: {
        name: "Direct Match Capital",
        type: "VC",
        thesis: "We back fintech infrastructure.",
        sectors: ["fintech"],
        stages: ["seed"],
        geographies: [],
        deals: {
          create: [
            { company: "Stripe", sector: "fintech", stage: "series-c", date: new Date("2020-01-01") },
            { company: "Ramp", sector: "fintech", stage: "series-a", date: new Date("2021-01-01") },
          ],
        },
      },
    });
    directInvestorId = direct.id;

    const coInvestor = await testPrisma.investor.create({
      data: {
        name: "Co-Investor Ventures",
        type: "VC",
        thesis: "We back B2B fintech.",
        sectors: ["fintech"],
        stages: ["seed"],
        geographies: [],
        deals: { create: [{ company: "Ramp", sector: "fintech", stage: "series-a", date: new Date("2021-01-01") }] },
      },
    });
    coInvestorId = coInvestor.id;
  });

  it("runs the full lifecycle: queued -> awaiting_approval -> approve -> complete, emitting notifications at each step", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/discovery",
      payload: { workspaceId, createdById: userId, comparableCompanies: ["Stripe", "Ramp", "Brex"] },
    });
    expect(created.statusCode).toBe(202);
    const run = created.json();
    expect(run.status).toBe("QUEUED");

    const runQueueJobs = await getDiscoveryRunQueue().getJobs(["waiting", "active", "completed"]);
    expect(runQueueJobs.some((j) => j.data.runId === run.id)).toBe(true);

    // Simulate the worker picking up the job.
    await processDiscoveryRun(testPrisma, run.id);

    const afterMatching = await app.inject({ method: "GET", url: `/discovery/${run.id}` });
    expect(afterMatching.statusCode).toBe(200);
    const matchedRun = afterMatching.json();
    expect(matchedRun.status).toBe("AWAITING_APPROVAL");

    const candidateIds = matchedRun.previewResults.candidates.map((c: { investorId: string }) => c.investorId);
    expect(candidateIds).toContain(directInvestorId);
    expect(candidateIds).toContain(coInvestorId);

    const directCandidate = matchedRun.previewResults.candidates.find(
      (c: { investorId: string }) => c.investorId === directInvestorId
    );
    expect(directCandidate.matchType).toBe("direct");
    expect(directCandidate.score).toBe(100);

    const notifications = await testPrisma.notification.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
    const statuses = notifications.map((n) => (n.payload as { status: string }).status);
    expect(statuses).toEqual(["QUEUED", "RUNNING", "AWAITING_APPROVAL"]);

    // Approve only the direct match.
    const approved = await app.inject({
      method: "POST",
      url: `/discovery/${run.id}/approve`,
      payload: { approvedInvestorIds: [directInvestorId] },
    });
    expect(approved.statusCode).toBe(202);
    expect(approved.json().status).toBe("APPROVED");

    const approvalQueueJobs = await getDiscoveryApprovalQueue().getJobs(["waiting", "active", "completed"]);
    expect(approvalQueueJobs.some((j) => j.data.runId === run.id)).toBe(true);

    await processDiscoveryApproval(testPrisma, run.id);

    const finalRes = await app.inject({ method: "GET", url: `/discovery/${run.id}` });
    const finalRun = finalRes.json();
    expect(finalRun.status).toBe("COMPLETE");
    expect(finalRun.resultSearchId).toBeTruthy();

    const enrichmentJobs = await testPrisma.enrichmentJob.findMany({ where: { workspaceId } });
    expect(enrichmentJobs).toHaveLength(1);
    expect(enrichmentJobs[0].investorId).toBe(directInvestorId);
    expect(enrichmentJobs[0].status).toBe("COMPLETE");

    const leads = await testPrisma.lead.findMany({ where: { searchId: finalRun.resultSearchId } });
    expect(leads).toHaveLength(1);
    expect(leads[0].investorId).toBe(directInvestorId);

    const finalNotifications = await testPrisma.notification.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    expect(finalNotifications.map((n) => (n.payload as { status: string }).status)).toEqual([
      "QUEUED",
      "RUNNING",
      "AWAITING_APPROVAL",
      "APPROVED",
      "COMPLETE",
    ]);
  });

  it("rejects approval of a run that isn't awaiting approval (409)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/discovery",
      payload: { workspaceId, createdById: userId, comparableCompanies: ["Stripe", "Ramp", "Brex"] },
    });
    const run = created.json();

    // Still QUEUED - never processed.
    const res = await app.inject({
      method: "POST",
      url: `/discovery/${run.id}/approve`,
      payload: { approvedInvestorIds: [directInvestorId] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects approving an investor id that wasn't a preview candidate (400)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/discovery",
      payload: { workspaceId, createdById: userId, comparableCompanies: ["Stripe", "Ramp", "Brex"] },
    });
    const run = created.json();
    await processDiscoveryRun(testPrisma, run.id);

    const otherInvestor = await testPrisma.investor.create({
      data: { name: "Not In Preview", type: "VC", sectors: [], stages: [], geographies: [] },
    });

    const res = await app.inject({
      method: "POST",
      url: `/discovery/${run.id}/approve`,
      payload: { approvedInvestorIds: [otherInvestor.id] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects fewer than 3 comparable companies", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/discovery",
      payload: { workspaceId, createdById: userId, comparableCompanies: ["Stripe", "Ramp"] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("webhook delivery (integration)", () => {
  let app: FastifyInstance;
  let workspaceId: string;
  let userId: string;
  let server: Server;
  let serverUrl: string;
  let received: { body: string; signature: string }[] = [];

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        received.push({
          body: Buffer.concat(chunks).toString("utf-8"),
          signature: String(req.headers["x-raisely-signature"] ?? ""),
        });
        res.writeHead(200);
        res.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address && typeof address === "object") {
      serverUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
    await closeDiscoveryQueues();
    await closeWebhookQueue();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    received = [];
    await resetDb();
    const user = await testPrisma.user.create({ data: { email: "founder5@integration-test.dev", role: "FOUNDER" } });
    userId = user.id;
    const workspace = await testPrisma.workspace.create({
      data: { name: "Webhook Test Workspace", slug: `webhook-ws-${Date.now()}`, ownerId: user.id },
    });
    workspaceId = workspace.id;
  });

  it("delivers a signed webhook payload when a discovery run's status changes", async () => {
    const endpointRes = await app.inject({
      method: "POST",
      url: "/webhook-endpoints",
      payload: { workspaceId, url: serverUrl },
    });
    expect(endpointRes.statusCode).toBe(201);
    const endpoint = endpointRes.json();

    const worker = startWebhookWorker();
    try {
      const created = await app.inject({
        method: "POST",
        url: "/discovery",
        payload: { workspaceId, createdById: userId, comparableCompanies: ["Stripe", "Ramp", "Brex"] },
      });
      expect(created.statusCode).toBe(202);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(received.length).toBeGreaterThan(0);
      const delivery = received[0];
      const expectedSignature = `sha256=${createHmac("sha256", endpoint.secret).update(delivery.body).digest("hex")}`;
      expect(delivery.signature).toBe(expectedSignature);

      const parsed = JSON.parse(delivery.body);
      expect(parsed.event).toBe("DISCOVERY_RUN_STATUS_CHANGED");
      expect(parsed.data.status).toBe("QUEUED");
    } finally {
      await worker.close();
    }
  }, 10_000);
});
