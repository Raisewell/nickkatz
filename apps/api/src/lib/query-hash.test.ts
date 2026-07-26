import { describe, it, expect } from "vitest";
import { computeThesisQueryHash } from "./query-hash.js";

describe("computeThesisQueryHash", () => {
  it("is stable for the same inputs", () => {
    const a = computeThesisQueryHash(["fintech"], ["b2b payments"]);
    const b = computeThesisQueryHash(["fintech"], ["b2b payments"]);
    expect(a).toBe(b);
  });

  it("is order- and case-insensitive", () => {
    const a = computeThesisQueryHash(["Fintech", "B2B SaaS"], ["payments"]);
    const b = computeThesisQueryHash(["b2b saas", "fintech"], ["Payments"]);
    expect(a).toBe(b);
  });

  it("differs when sectors or keywords differ", () => {
    const a = computeThesisQueryHash(["fintech"], []);
    const b = computeThesisQueryHash(["healthtech"], []);
    expect(a).not.toBe(b);
  });

  it("ignores stage/geography (not part of thesis-match relevance)", () => {
    // caller only ever passes sectors/keywords, so this is really just
    // documenting that the hash has no other inputs
    const a = computeThesisQueryHash(["fintech"], ["payments"]);
    const b = computeThesisQueryHash(["fintech"], ["payments"]);
    expect(a).toBe(b);
  });
});
