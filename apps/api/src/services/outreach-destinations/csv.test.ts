import { describe, it, expect } from "vitest";
import { csvDestination, buildOutreachCsv } from "./csv.js";
import type { OutreachRecipient } from "./types.js";

function recipient(overrides: Partial<OutreachRecipient> = {}): OutreachRecipient {
  return {
    leadId: "lead_1",
    investorName: "Acme Ventures",
    contactName: "Jordan Lee",
    contactTitle: "Partner",
    contactEmail: "jordan@acme.vc",
    contactLinkedInUrl: "https://linkedin.com/in/jordanlee",
    fitScore: 84,
    tier: "A",
    firstLine: "Hi Jordan,",
    emailSubject: "Quick intro",
    emailBody: "Body text",
    ...overrides,
  };
}

describe("csvDestination", () => {
  it("builds a header row plus one row per recipient", () => {
    const csv = buildOutreachCsv([recipient()]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "Investor,Contact Name,Title,Email,LinkedIn URL,Fit Score,Tier,First Line,Email Subject,Email Body"
    );
    expect(lines[1]).toContain("Acme Ventures");
    expect(lines[1]).toContain("jordan@acme.vc");
  });

  it("escapes commas, quotes, and newlines", () => {
    const csv = buildOutreachCsv([recipient({ investorName: 'Acme, "The Best" Ventures\nSeed Fund' })]);
    expect(csv).toContain('"Acme, ""The Best"" Ventures\nSeed Fund"');
  });

  it("send() always succeeds for every recipient and returns the CSV content", async () => {
    const result = await csvDestination.send([recipient(), recipient({ leadId: "lead_2" })]);
    expect(result).toMatchObject({ destination: "csv", succeeded: 2, failed: 0 });
    expect(result.details).toContain("Acme Ventures");
  });

  it("is always marked implemented (no external account needed)", () => {
    expect(csvDestination.implemented).toBe(true);
  });
});
