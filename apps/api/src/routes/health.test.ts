import { describe, it, expect, afterAll } from "vitest";
import { buildApp } from "../app.js";

describe("health routes", () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });

  it("GET /health/db checks the database connection", async () => {
    const res = await app.inject({ method: "GET", url: "/health/db" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });
});
