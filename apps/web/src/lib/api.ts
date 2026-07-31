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
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.message ?? `Request failed with status ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function get<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

function post<T>(path: string, payload: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(payload) });
}

function postForm<T>(path: string, form: FormData): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: form });
}

function patch<T>(path: string, payload: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(payload) });
}

function del(path: string): Promise<void> {
  return apiFetch<void>(path, { method: "DELETE" });
}

function qs(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) usp.set(k, v);
  return usp.toString();
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

export interface PipelineLead extends Lead {
  searchId: string;
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

export function listSearches(params: { workspaceId: string; userId: string; saved?: boolean }): Promise<SearchListItem[]> {
  return get(`/searches?${qs({ workspaceId: params.workspaceId, userId: params.userId, saved: params.saved === undefined ? undefined : String(params.saved) })}`);
}

export function getSearch(id: string, params: { workspaceId: string; userId: string }): Promise<{ search: SearchSummary; leads: Lead[] }> {
  return get(`/searches/${id}?${qs(params)}`);
}

export function saveSearch(id: string, payload: { workspaceId: string; userId: string; name?: string; saved?: boolean }): Promise<SearchSummary> {
  return patch(`/searches/${id}`, payload);
}

export function deleteSearch(id: string, params: { workspaceId: string; userId: string }): Promise<void> {
  return del(`/searches/${id}?${qs(params)}`);
}

export function rerunSearch(id: string, payload: { workspaceId: string; createdById: string }): Promise<RunSearchResult> {
  return post(`/searches/${id}/rerun`, payload);
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

export function listPipelineLeads(params: { workspaceId: string; userId: string; pipelineStage?: string }): Promise<PipelineLead[]> {
  return get(`/leads?${qs(params)}`);
}

export function updatePipelineStage(
  leadId: string,
  payload: { workspaceId: string; userId: string; pipelineStage?: string; tier?: string; tags?: string[] }
): Promise<Lead> {
  return patch(`/leads/${leadId}`, payload);
}

export interface ExclusionListSummary {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: string;
  entryCount: number;
}

export function listExclusionLists(params: { workspaceId: string; userId: string }): Promise<ExclusionListSummary[]> {
  return get(`/exclusion-lists?${qs(params)}`);
}

export function createExclusionList(payload: { workspaceId: string; userId: string; name: string }): Promise<ExclusionListSummary> {
  return post("/exclusion-lists", payload);
}

export function uploadExclusionCsv(
  listId: string,
  params: { workspaceId: string; userId: string },
  file: File
): Promise<{ detectedFormat: string; rowsParsed: number; entriesCreated: number }> {
  const form = new FormData();
  form.set("file", file);
  return postForm(`/exclusion-lists/${listId}/upload?${qs(params)}`, form);
}

export function deleteExclusionList(id: string, params: { workspaceId: string; userId: string }): Promise<void> {
  return del(`/exclusion-lists/${id}?${qs(params)}`);
}

export interface DiscoveryCandidate {
  investorId: string;
  investorName: string;
  matchType: "direct" | "co_investment";
  score: number;
  reason: string;
  matchedCompanies: string[];
}

export interface DiscoveryRun {
  id: string;
  workspaceId: string;
  createdById: string;
  comparableCompanies: string[];
  status: string;
  previewResults: {
    candidates: DiscoveryCandidate[];
    inferredSectors: string[];
    generatedAt: string;
    approvedInvestorIds?: string[];
  } | null;
  resultSearchId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createDiscoveryRun(payload: {
  workspaceId: string;
  createdById: string;
  comparableCompanies: string[];
}): Promise<DiscoveryRun> {
  return post("/discovery", payload);
}

export function listDiscoveryRuns(params: { workspaceId: string; userId: string }): Promise<DiscoveryRun[]> {
  return get(`/discovery?${qs(params)}`);
}

export function getDiscoveryRun(id: string, params: { workspaceId: string; userId: string }): Promise<DiscoveryRun> {
  return get(`/discovery/${id}?${qs(params)}`);
}

export function approveDiscoveryRun(
  id: string,
  payload: { workspaceId: string; userId: string; approvedInvestorIds: string[] }
): Promise<DiscoveryRun> {
  return post(`/discovery/${id}/approve`, payload);
}

export function importNetworkContacts(
  params: { workspaceId: string; userId: string },
  file: File
): Promise<{ detectedFormat: string; rowsParsed: number; contactsCreated: number }> {
  const form = new FormData();
  form.set("file", file);
  return postForm(`/network-contacts/import?${qs(params)}`, form);
}

export interface WarmPath {
  id: string;
  workspaceId: string;
  leadId: string | null;
  targetContactId: string;
  mutualName: string | null;
  strengthScore: number | null;
  verified: boolean;
  createdAt: string;
}

export function computeWarmPaths(payload: { workspaceId: string; userId: string; leadId: string }): Promise<{ created: number }> {
  return post("/warm-paths/compute", payload);
}

export function listWarmPaths(params: { workspaceId: string; userId: string; leadId: string }): Promise<WarmPath[]> {
  return get(`/warm-paths?${qs(params)}`);
}

export interface Notification {
  id: string;
  workspaceId: string;
  userId: string | null;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export function listNotifications(params: { workspaceId: string; userId: string; unreadOnly?: boolean }): Promise<Notification[]> {
  return get(`/notifications?${qs({ workspaceId: params.workspaceId, userId: params.userId, unreadOnly: params.unreadOnly === undefined ? undefined : String(params.unreadOnly) })}`);
}

export function markNotificationRead(id: string, params: { workspaceId: string; userId: string }): Promise<Notification> {
  return post(`/notifications/${id}/read?${qs(params)}`, undefined);
}

export interface UsageSummary {
  limit: number;
  used: number;
  remaining: number;
  periodStart: string;
}

export function getUsage(params: { workspaceId: string; userId: string }): Promise<UsageSummary> {
  return get(`/usage?${qs(params)}`);
}

export interface BillingSummary {
  plan: string;
  planLabel: string;
  usageLimit: number;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  hasStripeCustomer: boolean;
}

export function getBillingSummary(params: { workspaceId: string; userId: string }): Promise<BillingSummary> {
  return get(`/billing?${qs(params)}`);
}

export interface PlanOption {
  id: string;
  label: string;
  usageLimit: number;
}

export function listPlans(): Promise<{ plans: PlanOption[] }> {
  return get("/billing/plans");
}

export function createCheckoutSession(payload: {
  workspaceId: string;
  userId: string;
  plan: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  return post("/billing/checkout", payload);
}

export function createPortalSession(payload: {
  workspaceId: string;
  userId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  return post("/billing/portal", payload);
}
