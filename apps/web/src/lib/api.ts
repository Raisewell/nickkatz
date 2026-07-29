import type { PipelineStage } from "@raisely/shared-types";
import type {
  DiscoveryRun,
  ExclusionList,
  Lead,
  LeadListItem,
  Notification,
  OutreachDestination,
  OutreachDraft,
  OutreachSendResult,
  RefineQueryResult,
  RunSearchResult,
  SearchDetail,
  SearchListItem,
  SearchSummary,
  Workspace,
} from "./types";
import { getApiToken } from "./api-token";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getApiToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${res.status}): ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const api = {
  listWorkspaces: () => request<Workspace[]>("/workspaces"),

  listSearches: (workspaceId: string, saved?: boolean) =>
    request<SearchListItem[]>(
      `/searches?workspaceId=${encodeURIComponent(workspaceId)}${saved !== undefined ? `&saved=${saved}` : ""}`
    ),

  getSearch: (id: string) => request<SearchDetail>(`/searches/${id}`),

  refineQuery: (text: string) =>
    request<RefineQueryResult>("/searches/refine", { method: "POST", ...json({ text }) }),

  runSearch: (body: {
    workspaceId: string;
    name?: string;
    queryText?: string;
    structuredQuery: RefineQueryResult["query"];
    saved?: boolean;
  }) => request<RunSearchResult>("/searches", { method: "POST", ...json(body) }),

  renameSearch: (id: string, body: { name?: string; saved?: boolean }) =>
    request<SearchSummary>(`/searches/${id}`, { method: "PATCH", ...json(body) }),

  deleteSearch: (id: string) => request<void>(`/searches/${id}`, { method: "DELETE" }),

  tierSearch: (id: string) => request(`/searches/${id}/tier`, { method: "POST" }),

  listLeads: (workspaceId: string, pipelineStage?: PipelineStage) =>
    request<LeadListItem[]>(
      `/leads?workspaceId=${encodeURIComponent(workspaceId)}${pipelineStage ? `&pipelineStage=${pipelineStage}` : ""}`
    ),

  patchLead: (
    id: string,
    body: { pipelineStage?: PipelineStage; tier?: Lead["tier"]; tags?: string[] }
  ) => request<Lead>(`/leads/${id}`, { method: "PATCH", ...json(body) }),

  draftOutreach: (leadId: string, companyOneLiner?: string) =>
    request<OutreachDraft>(`/leads/${leadId}/draft`, {
      method: "POST",
      ...json(companyOneLiner ? { companyOneLiner } : {}),
    }),

  listDrafts: (leadId: string) => request<OutreachDraft[]>(`/leads/${leadId}/drafts`),

  patchDraft: (id: string, body: Partial<Pick<OutreachDraft, "firstLine" | "subject" | "body">>) =>
    request<OutreachDraft>(`/outreach-drafts/${id}`, { method: "PATCH", ...json(body) }),

  listOutreachDestinations: () => request<OutreachDestination[]>("/outreach/destinations"),

  sendOutreach: (body: { destination: string; leadIds: string[]; config?: Record<string, unknown> }) =>
    request<OutreachSendResult>("/outreach/send", { method: "POST", ...json(body) }),

  exportOutreachCsv: async (leadIds: string[]) => {
    const token = await getApiToken();
    const res = await fetch(`${API_URL}/outreach/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ leadIds }),
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    return res.blob();
  },

  listDiscoveryRuns: (workspaceId: string) =>
    request<DiscoveryRun[]>(`/discovery?workspaceId=${encodeURIComponent(workspaceId)}`),

  getDiscoveryRun: (id: string) => request<DiscoveryRun>(`/discovery/${id}`),

  createDiscoveryRun: (body: { workspaceId: string; comparableCompanies: string[] }) =>
    request<DiscoveryRun>("/discovery", { method: "POST", ...json(body) }),

  approveDiscoveryRun: (id: string, approvedInvestorIds: string[]) =>
    request<DiscoveryRun>(`/discovery/${id}/approve`, { method: "POST", ...json({ approvedInvestorIds }) }),

  listExclusionLists: (workspaceId: string) =>
    request<ExclusionList[]>(`/exclusion-lists?workspaceId=${encodeURIComponent(workspaceId)}`),

  createExclusionList: (workspaceId: string, name: string) =>
    request<ExclusionList>("/exclusion-lists", { method: "POST", ...json({ workspaceId, name }) }),

  deleteExclusionList: (id: string) => request<void>(`/exclusion-lists/${id}`, { method: "DELETE" }),

  uploadExclusionListFile: async (id: string, file: File) => {
    const token = await getApiToken();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/exclusion-lists/${id}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
    return res.json() as Promise<{ detectedFormat: string; rowsParsed: number; entriesCreated: number }>;
  },

  importNetworkContacts: async (workspaceId: string, file: File) => {
    const token = await getApiToken();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/network-contacts/import?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Import failed (${res.status}): ${await res.text()}`);
    return res.json() as Promise<{ detectedFormat: string; rowsParsed: number; contactsCreated: number }>;
  },

  listNotifications: (workspaceId: string, unreadOnly?: boolean) =>
    request<Notification[]>(
      `/notifications?workspaceId=${encodeURIComponent(workspaceId)}${unreadOnly ? "&unreadOnly=true" : ""}`
    ),

  markNotificationRead: (id: string) => request<Notification>(`/notifications/${id}/read`, { method: "POST" }),
};
