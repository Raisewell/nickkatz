import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readMasterCsv } from "../csv.js";
import {
  buildCompanyBrief,
  buildCrossCompanyBrief,
  clusterObjectionsForCompany,
  deriveCompany,
  renderCompanyBriefMarkdown,
} from "../insights.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_CSV = path.join(__dirname, "..", "..", "data", "RAISE_FIS_master_calls.csv");

const { rows } = readMasterCsv(SEED_CSV);
const allRecords = rows.map((r) => r.record);
const supersharpRecords = allRecords.filter((r) => deriveCompany(r) === "supersharp");
const propelrRecords = allRecords.filter((r) => deriveCompany(r) === "propelr");

describe("deriveCompany", () => {
  it("reads the company slug from the call_id prefix", () => {
    expect(deriveCompany(supersharpRecords[0])).toBe("supersharp");
    expect(deriveCompany(propelrRecords[0])).toBe("propelr");
  });
});

describe("clusterObjectionsForCompany (SuperSharp real data)", () => {
  it("surfaces the ownership/structure objection (category 'other') as the dominant, pattern-level cluster", () => {
    const clusters = clusterObjectionsForCompany(supersharpRecords);
    const top = clusters[0];
    // uki2s, x50, fabric, balderton all objected on Satlantis ownership under category "other"
    expect(top.objection_category).toBe("other");
    expect(top.count).toBeGreaterThanOrEqual(4);
    expect(top.isPattern).toBe(true);
  });

  it("excludes not_discussed objections from clustering", () => {
    const clusters = clusterObjectionsForCompany(propelrRecords);
    const totalClustered = clusters.reduce((sum, c) => sum + c.count, 0);
    // propelr_zigg has top_objection === "not_discussed" and should be excluded
    expect(totalClustered).toBe(propelrRecords.length - 1);
  });
});

describe("buildCompanyBrief", () => {
  it("flags the interest-vs-resolution trust gap for SuperSharp", () => {
    const brief = buildCompanyBrief(supersharpRecords);
    expect(brief.company).toBe("supersharp");
    expect(brief.interestVsResolutionGap).toBe(true);
  });

  it("ranks team/product/market/traction/vision pillar averages ascending", () => {
    const brief = buildCompanyBrief(supersharpRecords);
    for (let i = 1; i < brief.pillarAverages.length; i++) {
      expect(brief.pillarAverages[i].average).toBeGreaterThanOrEqual(brief.pillarAverages[i - 1].average);
    }
  });

  it("renders markdown mentioning the dominant objection category", () => {
    const md = renderCompanyBriefMarkdown(buildCompanyBrief(supersharpRecords));
    expect(md).toContain("supersharp");
    expect(md).toContain("`other`");
  });
});

describe("buildCrossCompanyBrief", () => {
  it("does not call a single-company cluster a market-wide pattern", () => {
    const brief = buildCrossCompanyBrief(allRecords);
    const otherCluster = brief.clusters.find((c) => c.objection_category === "other");
    // "other" is concentrated in supersharp only across this seed dataset, so it
    // should not qualify as a cross-company market-wide signal yet.
    expect(otherCluster?.isPattern).toBe(false);
  });
});
