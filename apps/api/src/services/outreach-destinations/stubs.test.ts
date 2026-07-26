import { describe, it, expect } from "vitest";
import {
  instantlyDestination,
  smartleadDestination,
  hubspotDestination,
  attioDestination,
  affinityDestination,
} from "./stubs.js";
import { OutreachDestinationNotImplementedError } from "./types.js";

describe("outreach destination stubs", () => {
  it.each([instantlyDestination, smartleadDestination, hubspotDestination, attioDestination, affinityDestination])(
    "$name is a typed stub: implemented=false and send() throws",
    async (destination) => {
      expect(destination.implemented).toBe(false);
      await expect(destination.send([])).rejects.toBeInstanceOf(OutreachDestinationNotImplementedError);
    }
  );
});
