import type { PipelineStage } from "@raisely/shared-types";
import type {
  Lead,
  LeadListItem,
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
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
    createdById: string;
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
    const res = await fetch(`${API_URL}/outreach/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds }),
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    return res.blob();
  },
};
