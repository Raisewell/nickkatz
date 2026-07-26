import type { FitScoreResult, InvestorType, LeadTier, StructuredQuery } from "@raisely/shared-types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.message ?? `Request failed with status ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function post<T>(path: string, payload: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(payload) });
}

function patch<T>(path: string, payload: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(payload) });
}

export interface DevSession {
  userId: string;
  email: string;
  name: string | null;
  workspaceId: string;
  workspaceName: string;
  companyOneLiner: string | null;
}

export function createDevSession(payload: {
  email: string;
  name?: string;
  workspaceName?: string;
  companyOneLiner?: string;
}): Promise<DevSession> {
  return post("/auth/dev-session", payload);
}

export interface RefineQueryResult {
  query: StructuredQuery;
  usedFallback: boolean;
  warning?: string;
}

export function refineQuery(text: string): Promise<RefineQueryResult> {
  return post("/searches/refine", { text });
}

export interface InvestorSummary {
  id: string;
  name: string;
  type: InvestorType;
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
  pipelineStage: string;
  tags: string[];
  bestWarmPath?: BestWarmPath | null;
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

export interface RunSearchResult {
  search: SearchSummary;
  results: Lead[];
  pagination: { page: number; pageSize: number; total: number };
  excludedCount: number;
}

export function runSearch(payload: {
  workspaceId: string;
  createdById: string;
  name?: string;
  queryText?: string;
  structuredQuery: StructuredQuery;
  saved?: boolean;
}): Promise<RunSearchResult> {
  return post("/searches", payload);
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

export function draftOutreach(
  leadId: string,
  payload: { workspaceId: string; userId: string; companyOneLiner?: string }
): Promise<OutreachDraft> {
  return post(`/leads/${leadId}/draft`, payload);
}

export function updatePipelineStage(
  leadId: string,
  payload: { workspaceId: string; userId: string; pipelineStage: string }
): Promise<Lead> {
  return patch(`/leads/${leadId}`, payload);
}
