import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "../test/db.js";
import { recordSuppression, isSuppressed, loadSuppressionChecker, InvalidSuppressionRequestError } from "./suppression.js";

describe("suppression service (integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("rejects a request with neither email nor linkedinUrl", async () => {
    await expect(recordSuppression(testPrisma, {})).rejects.toThrow(InvalidSuppressionRequestError);
  });

  it("records a suppression and normalizes email casing", async () => {
    const result = await recordSuppression(testPrisma, { email: "Person@Example.com" });
    expect(result.suppressionId).toBeTruthy();

    const stored = await testPrisma.suppression.findUniqueOrThrow({ where: { id: result.suppressionId } });
    expect(stored.email).toBe("person@example.com");
  });

  it("purges matching Contact and NetworkContact rows, but not ExclusionEntry", async () => {
    const user = await testPrisma.user.create({ data: { email: "founder-supp@integration-test.dev", role: "FOUNDER" } });
    const workspace = await testPrisma.workspace.create({
      data: { name: "Suppression Test WS", slug: `supp-ws-${Date.now()}`, ownerId: user.id },
    });
    const investor = await testPrisma.investor.create({
      data: { name: "Erasure Capital", type: "VC", sectors: [], stages: [], geographies: [] },
    });
    const contact = await testPrisma.contact.create({
      data: { investorId: investor.id, name: "Jamie Partner", email: "jamie@erasure.vc", linkedinUrl: "https://www.linkedin.com/in/jamiepartner/" },
    });
    const networkContact = await testPrisma.networkContact.create({
      data: { workspaceId: workspace.id, name: "Jamie Partner", email: "jamie@erasure.vc" },
    });
    const list = await testPrisma.exclusionList.create({ data: { workspaceId: workspace.id, name: "Do not contact" } });
    const exclusionEntry = await testPrisma.exclusionEntry.create({
      data: { workspaceId: workspace.id, exclusionListId: list.id, name: "Jamie Partner", email: "jamie@erasure.vc", source: "MANUAL" },
    });

    const result = await recordSuppression(testPrisma, { email: "jamie@erasure.vc" });
    expect(result.contactsPurged).toBe(1);
    expect(result.networkContactsPurged).toBe(1);

    expect(await testPrisma.contact.findUnique({ where: { id: contact.id } })).toBeNull();
    expect(await testPrisma.networkContact.findUnique({ where: { id: networkContact.id } })).toBeNull();
    expect(await testPrisma.exclusionEntry.findUnique({ where: { id: exclusionEntry.id } })).not.toBeNull();
  });

  it("purges by normalized linkedinUrl even when stored formatting differs", async () => {
    const investor = await testPrisma.investor.create({
      data: { name: "URL Capital", type: "VC", sectors: [], stages: [], geographies: [] },
    });
    const contact = await testPrisma.contact.create({
      data: { investorId: investor.id, name: "Robin Analyst", linkedinUrl: "https://LinkedIn.com/in/RobinAnalyst/" },
    });

    await recordSuppression(testPrisma, { linkedinUrl: "linkedin.com/in/robinanalyst" });

    expect(await testPrisma.contact.findUnique({ where: { id: contact.id } })).toBeNull();
  });

  it("isSuppressed reflects recorded suppressions by email and linkedinUrl", async () => {
    await recordSuppression(testPrisma, { email: "blocked@example.com" });
    await recordSuppression(testPrisma, { linkedinUrl: "https://www.linkedin.com/in/blockedperson/" });

    expect(await isSuppressed(testPrisma, { email: "Blocked@Example.com" })).toBe(true);
    expect(await isSuppressed(testPrisma, { email: "allowed@example.com" })).toBe(false);
    expect(await isSuppressed(testPrisma, { linkedinUrl: "linkedin.com/in/blockedperson" })).toBe(true);
    expect(await isSuppressed(testPrisma, { linkedinUrl: "linkedin.com/in/someoneelse" })).toBe(false);
  });

  it("loadSuppressionChecker matches the same way as isSuppressed, from one query", async () => {
    await recordSuppression(testPrisma, { email: "batch@example.com" });

    const check = await loadSuppressionChecker(testPrisma);
    expect(check({ email: "Batch@Example.com" })).toBe(true);
    expect(check({ email: "other@example.com" })).toBe(false);
  });
});
