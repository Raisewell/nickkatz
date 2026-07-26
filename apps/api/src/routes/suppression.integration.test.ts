import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";

describe("POST /opt-out (integration)", () => {
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

  it("records a suppression and purges matching PII, without exposing whether anything matched", async () => {
    const investor = await testPrisma.investor.create({
      data: { name: "Opt Out Capital", type: "VC", sectors: [], stages: [], geographies: [] },
    });
    const contact = await testPrisma.contact.create({
      data: { investorId: investor.id, name: "Erased Person", email: "erase-me@example.com" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/opt-out",
      payload: { email: "erase-me@example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "acknowledged",
      message: expect.any(String),
    });

    expect(await testPrisma.contact.findUnique({ where: { id: contact.id } })).toBeNull();
    const stored = await testPrisma.suppression.findFirst({ where: { email: "erase-me@example.com" } });
    expect(stored).not.toBeNull();
  });

  it("returns the same acknowledgement even when nothing matches", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/opt-out",
      payload: { email: "nobody-here@example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("acknowledged");
  });

  it("rejects a request with neither email nor linkedinUrl", async () => {
    const res = await app.inject({ method: "POST", url: "/opt-out", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("rate-limits repeated requests", async () => {
    // Fresh app instance so this test's rate-limit counter isn't polluted
    // by the /opt-out calls made in the other `it` blocks above.
    const isolatedApp = buildApp();
    await isolatedApp.ready();

    const responses = [];
    for (let i = 0; i < 6; i += 1) {
      responses.push(
        await isolatedApp.inject({
          method: "POST",
          url: "/opt-out",
          payload: { email: `rate-limit-${i}@example.com` },
        })
      );
    }
    await isolatedApp.close();

    const statusCodes = responses.map((r) => r.statusCode);
    expect(statusCodes.filter((c) => c === 200)).toHaveLength(5);
    expect(statusCodes.filter((c) => c === 429)).toHaveLength(1);
  });
});
