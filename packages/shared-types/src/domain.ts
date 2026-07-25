import type { InvestorType } from "./enums.js";

/** Structured shape of Search.structuredQuery, produced by the query refiner
 * (Phase 2) or built directly from the Firm Finder filter UI. */
export interface StructuredQuery {
  stages: string[];
  sectors: string[];
  geographies: string[];
  checkRange: {
    min: number | null;
    max: number | null;
  };
  investorTypes: InvestorType[];
  keywords: string[];
  excludeCompetitorsOf?: string[];
}

/** One weighted component of a Lead's fit score, stored in Lead.fitReasons. */
export interface FitScoreComponent {
  factor: "thesis_match" | "stage_fit" | "recent_activity" | "geography" | "freshness";
  points: number;
  max: number;
  evidence: string;
  dealIds?: string[];
}

export interface FitFlag {
  type: "conflict" | "info" | "warning";
  detail: string;
}

/** Full shape of Lead.fitReasons. */
export interface FitScoreResult {
  score: number;
  components: FitScoreComponent[];
  flags: FitFlag[];
}

/** Per-field provenance entry stored in Contact.provenance. */
export interface ProvenanceEntry {
  value: string;
  source: string;
  fetchedAt: string;
}

export type ContactProvenance = Partial<
  Record<"name" | "title" | "email" | "linkedinUrl", ProvenanceEntry>
>;
