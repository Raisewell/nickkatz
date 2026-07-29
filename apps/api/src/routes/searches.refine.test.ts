import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { signTestToken } from "../test/auth.js";

describe("POST /searches/refine", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    token = await signTestToken("refine-test-user");
  });

  afterAll(async () => {
    await app.close();
  });

  it("falls back to a keyword-based structured query when no Anthropic API key is configured", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/searches/refine",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "raising a $3M seed for a b2b fintech company in London" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.usedFallback).toBe(true);
    expect(body.warning).toBeTruthy();
    expect(body.query.keywords.length).toBeGreaterThan(0);
    // Never returns something the UI can't render/edit.
    expect(body.query).toMatchObject({
      stages: [],
      sectors: [],
      geographies: [],
      investorTypes: [],
      checkRange: { min: null, max: null },
    });
  });

  it("rejects an empty query", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/searches/refine",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects requests with no bearer token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/searches/refine",
      payload: { text: "seed fintech" },
    });
    expect(res.statusCode).toBe(401);
  });
});
