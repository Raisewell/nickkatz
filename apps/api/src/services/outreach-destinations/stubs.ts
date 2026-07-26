import type { OutreachDestination, OutreachRecipient, OutreachSendResult } from "./types.js";
import { OutreachDestinationNotImplementedError } from "./types.js";

// TODO: implement against Instantly's campaign/lead API (https://developer.instantly.ai).
function makeStub(key: string, name: string): OutreachDestination {
  return {
    key,
    name,
    implemented: false,
    async send(_recipients: OutreachRecipient[], _config?: Record<string, unknown>): Promise<OutreachSendResult> {
      throw new OutreachDestinationNotImplementedError(name);
    },
  };
}

// TODO: implement against Instantly's API.
export const instantlyDestination = makeStub("instantly", "Instantly");

// TODO: implement against Smartlead's API.
export const smartleadDestination = makeStub("smartlead", "Smartlead");

// TODO: implement against HubSpot's CRM contacts/engagements API.
export const hubspotDestination = makeStub("hubspot", "HubSpot");

// TODO: implement against Attio's API.
export const attioDestination = makeStub("attio", "Attio");

// TODO: implement against Affinity's API.
export const affinityDestination = makeStub("affinity", "Affinity");
