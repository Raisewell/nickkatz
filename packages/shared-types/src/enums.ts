export const USER_ROLES = ["FOUNDER", "ADVISOR"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const WORKSPACE_ROLES = ["OWNER", "ADVISOR", "MEMBER"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const INVESTOR_TYPES = ["VC", "ANGEL", "FAMILY_OFFICE", "CVC", "STRATEGIC"] as const;
export type InvestorType = (typeof INVESTOR_TYPES)[number];

export const DATA_SOURCES = [
  "MANUAL",
  "LINKEDIN_IMPORT",
  "CSV_IMPORT",
  "ENRICHMENT_API",
  "AI_INFERRED",
] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const SEARCH_STATUSES = ["DRAFT", "QUEUED", "RUNNING", "COMPLETE", "FAILED"] as const;
export type SearchStatus = (typeof SEARCH_STATUSES)[number];

export const LEAD_TIERS = ["A", "B", "C"] as const;
export type LeadTier = (typeof LEAD_TIERS)[number];

export const PIPELINE_STAGES = [
  "IDENTIFIED",
  "CONTACTED",
  "REPLIED",
  "MEETING",
  "DILIGENCE",
  "TERM_SHEET",
  "PASSED",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const EXCLUSION_SOURCES = ["MANUAL", "LINKEDIN_IMPORT", "CSV"] as const;
export type ExclusionSource = (typeof EXCLUSION_SOURCES)[number];

export const ENRICHMENT_JOB_STATUSES = ["QUEUED", "RUNNING", "COMPLETE", "FAILED"] as const;
export type EnrichmentJobStatus = (typeof ENRICHMENT_JOB_STATUSES)[number];

export const DISCOVERY_RUN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "AWAITING_APPROVAL",
  "APPROVED",
  "COMPLETE",
  "FAILED",
] as const;
export type DiscoveryRunStatus = (typeof DISCOVERY_RUN_STATUSES)[number];

export const USAGE_EVENT_TYPES = [
  "SEARCH",
  "ENRICHMENT",
  "DISCOVERY_RUN",
  "OUTREACH_DRAFT",
  "EXPORT",
] as const;
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];
