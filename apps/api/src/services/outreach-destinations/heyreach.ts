import type { OutreachDestination, OutreachRecipient, OutreachSendResult } from "./types.js";

/**
 * HeyReach's public API (verified against https://github.com/bcharleson/heyreach-cli,
 * a working open-source client, since HeyReach's own docs site blocks
 * automated fetches):
 *   Base URL: https://api.heyreach.io/api/public
 *   Auth: X-API-KEY header
 *   POST /campaign/AddLeadsToCampaignV2
 *     { campaignId: number, accountLeadPairs: [{ lead: { firstName, lastName, profileUrl, ... } }] }
 *   Response (V2): { addedLeadsCount, updatedLeadsCount, failedLeadsCount }
 * HeyReach is LinkedIn-outreach-first, so a recipient needs a LinkedIn URL
 * to be sendable - anyone missing one is reported as failed rather than
 * silently dropped.
 */

const HEYREACH_BASE_URL = "https://api.heyreach.io/api/public";

interface HeyReachAddLeadsResponse {
  addedLeadsCount?: number;
  updatedLeadsCount?: number;
  failedLeadsCount?: number;
}

interface HeyReachLead {
  firstName: string;
  lastName: string;
  profileUrl: string;
  companyName?: string;
  position?: string;
  emailAddress?: string;
}

function splitName(contactName: string | null): { firstName: string; lastName: string } {
  if (!contactName) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = contactName.trim().split(/\s+/);
  return { firstName: firstName ?? "", lastName: rest.join(" ") };
}

export interface HeyReachConfig {
  campaignId: number;
  apiKey?: string;
}

export function createHeyReachDestination(fetchImpl: typeof fetch = fetch): OutreachDestination {
  return {
    key: "heyreach",
    name: "HeyReach",
    implemented: true,
    async send(recipients: OutreachRecipient[], config?: Record<string, unknown>): Promise<OutreachSendResult> {
      const { campaignId, apiKey } = (config ?? {}) as Partial<HeyReachConfig>;
      const key = apiKey ?? process.env.HEYREACH_API_KEY;

      if (!key) {
        return { destination: "heyreach", succeeded: 0, failed: recipients.length, details: "Missing HeyReach API key" };
      }
      if (campaignId == null) {
        return { destination: "heyreach", succeeded: 0, failed: recipients.length, details: "Missing campaignId" };
      }

      const sendable = recipients.filter((r) => r.contactLinkedInUrl);
      const unsendable = recipients.length - sendable.length;

      if (sendable.length === 0) {
        return {
          destination: "heyreach",
          succeeded: 0,
          failed: recipients.length,
          details: "No recipients had a LinkedIn URL (required by HeyReach)",
        };
      }

      const accountLeadPairs = sendable.map((r) => {
        const { firstName, lastName } = splitName(r.contactName);
        const lead: HeyReachLead = {
          firstName,
          lastName,
          profileUrl: r.contactLinkedInUrl!,
          companyName: r.investorName,
        };
        if (r.contactTitle) lead.position = r.contactTitle;
        if (r.contactEmail) lead.emailAddress = r.contactEmail;
        return { lead };
      });

      const res = await fetchImpl(`${HEYREACH_BASE_URL}/campaign/AddLeadsToCampaignV2`, {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, accountLeadPairs }),
      });

      if (!res.ok) {
        const body = await res.text();
        return {
          destination: "heyreach",
          succeeded: 0,
          failed: recipients.length,
          details: `HeyReach API responded ${res.status}: ${body}`,
        };
      }

      const data = (await res.json()) as HeyReachAddLeadsResponse;
      const succeeded = (data.addedLeadsCount ?? 0) + (data.updatedLeadsCount ?? 0);
      const failed = (data.failedLeadsCount ?? 0) + unsendable;

      return { destination: "heyreach", succeeded, failed };
    },
  };
}

export const heyreachDestination = createHeyReachDestination();
