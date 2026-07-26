import type { OutreachDestination } from "./types.js";
import { csvDestination } from "./csv.js";
import { heyreachDestination } from "./heyreach.js";
import {
  instantlyDestination,
  smartleadDestination,
  hubspotDestination,
  attioDestination,
  affinityDestination,
} from "./stubs.js";

export const OUTREACH_DESTINATIONS: OutreachDestination[] = [
  csvDestination,
  heyreachDestination,
  instantlyDestination,
  smartleadDestination,
  hubspotDestination,
  attioDestination,
  affinityDestination,
];

const byKey = new Map(OUTREACH_DESTINATIONS.map((d) => [d.key, d]));

export function getOutreachDestination(key: string): OutreachDestination | undefined {
  return byKey.get(key);
}

export type { OutreachDestination, OutreachRecipient, OutreachSendResult } from "./types.js";
export { OutreachDestinationNotImplementedError } from "./types.js";
