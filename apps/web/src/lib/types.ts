import type {
  FitScoreResult,
  StructuredQuery,
  PipelineStage,
  LeadTier,
} from "@raisely/shared-types";

export interface WorkspaceMember {
  id: string;
  role: string;
  user: { id: string; name: string | null; email: string };
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  usageLimit: number;
  companyOneLiner: string | null;
  ownerId: string;
  members: WorkspaceMember[];
}

export interface InvestorSummary {
  id: string;
  name: string;
  type: string;
  thesis: string | null;
  sectors: string[];
  stages: string[];
  geographies: string[];
  checkMin: number | null;
  checkMax: number | null;
  website: string | null;
  linkedinUrl: string | null;
}

export interface BestWarmPath {
  id: string;
  targetContactId: string;
  mutualName: string | null;
  strengthScore: number | null;
  verified: boolean;
}

export interface Lead {
  id: string;
  investorId: string;
  investor: InvestorSummary;
  fitScore: number | null;
  fitReasons: FitScoreResult | null;
  tier: LeadTier | null;
  pipelineStage: PipelineStage;
  tags: string[];
  bestWarmPath?: BestWarmPath | null;
}

export interface LeadListItem extends Lead {
  searchId: string;
  searchName: string | null;
}

export interface SearchSummary {
  id: string;
  name: string | null;
  queryText: string | null;
  structuredQuery: StructuredQuery;
  status: string;
  saved: boolean;
  excludedCount: number;
  createdAt: string;
}

export interface SearchListItem extends SearchSummary {
  leadCount: number;
}

export interface SearchDetail {
  search: SearchSummary;
  leads: Lead[];
}

export interface RunSearchResult {
  search: SearchSummary;
  results: Lead[];
  pagination: { page: number; pageSize: number; total: number };
  excludedCount: number;
}

export interface RefineQueryResult {
  query: StructuredQuery;
  usedFallback: boolean;
  warning?: string;
}

export interface OutreachDraft {
  id: string;
  leadId: string;
  firstLine: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachDestination {
  key: string;
  name: string;
  implemented: boolean;
}

export interface OutreachSendResult {
  destination: string;
  succeeded: number;
  failed: number;
  details?: string;
}
