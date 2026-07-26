import { describe, it, expect, vi } from "vitest";
import { createHeyReachDestination } from "./heyreach.js";
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
    firstLine: null,
    emailSubject: null,
    emailBody: null,
    ...overrides,
  };
}

describe("HeyReach destination", () => {
  it("posts to AddLeadsToCampaignV2 with X-API-KEY auth and the documented body shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ addedLeadsCount: 1, updatedLeadsCount: 0, failedLeadsCount: 0 }),
    });
    const destination = createHeyReachDestination(fetchMock as unknown as typeof fetch);

    const result = await destination.send([recipient()], { campaignId: 123, apiKey: "hr_key" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.heyreach.io/api/public/campaign/AddLeadsToCampaignV2");
    expect(init.headers["X-API-KEY"]).toBe("hr_key");

    const body = JSON.parse(init.body);
    expect(body.campaignId).toBe(123);
    expect(body.accountLeadPairs).toEqual([
      {
        lead: {
          firstName: "Jordan",
          lastName: "Lee",
          profileUrl: "https://linkedin.com/in/jordanlee",
          companyName: "Acme Ventures",
          position: "Partner",
          emailAddress: "jordan@acme.vc",
        },
      },
    ]);

    expect(result).toEqual({ destination: "heyreach", succeeded: 1, failed: 0 });
  });

  it("reports missing-LinkedIn recipients as failed instead of dropping them", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ addedLeadsCount: 1, failedLeadsCount: 0 }),
    });
    const destination = createHeyReachDestination(fetchMock as unknown as typeof fetch);

    const result = await destination.send(
      [recipient(), recipient({ leadId: "lead_2", contactLinkedInUrl: null })],
      { campaignId: 123, apiKey: "hr_key" }
    );

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.accountLeadPairs).toHaveLength(1);
  });

  it("fails gracefully (not throwing) when no API key is configured", async () => {
    const fetchMock = vi.fn();
    const destination = createHeyReachDestination(fetchMock as unknown as typeof fetch);
    delete process.env.HEYREACH_API_KEY;

    const result = await destination.send([recipient()], { campaignId: 123 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ destination: "heyreach", succeeded: 0, failed: 1 });
  });

  it("surfaces a non-2xx HeyReach response as a failed result rather than throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" });
    const destination = createHeyReachDestination(fetchMock as unknown as typeof fetch);

    const result = await destination.send([recipient()], { campaignId: 123, apiKey: "bad_key" });

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.details).toContain("401");
  });
});
