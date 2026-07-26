import type { PrismaClient } from "@prisma/client";

export class WorkspaceNotFoundForExportError extends Error {
  constructor(workspaceId: string) {
    super(`Workspace ${workspaceId} not found`);
    this.name = "WorkspaceNotFoundForExportError";
  }
}

export class NotWorkspaceOwnerError extends Error {
  constructor(workspaceId: string) {
    super(`Only the workspace owner can delete workspace ${workspaceId}`);
    this.name = "NotWorkspaceOwnerError";
  }
}

/**
 * GDPR/CCPA data portability (Art. 20) for the founder's own account data - distinct from
 * the /opt-out suppression flow (services/suppression.ts), which is right-to-erasure for
 * third-party investor Contacts scraped/enriched into the system, not for a workspace's own
 * data. Everything here is data the workspace itself created or owns.
 *
 * WebhookEndpoint.secret is deliberately omitted - it's a credential the workspace
 * generated to authenticate inbound calls from Raisely, not personal data the workspace is
 * entitled to export, and re-exposing it here would let anyone who obtains the export
 * impersonate Raisely's webhook sender to that endpoint.
 */
export async function exportWorkspaceData(prisma: PrismaClient, workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: { include: { user: { select: { id: true, email: true, name: true, role: true } } } },
      searches: { include: { leads: true } },
      exclusionLists: { include: { entries: true } },
      discoveryRuns: true,
      enrichmentJobs: true,
      warmPaths: true,
      networkContacts: true,
      outreachDrafts: true,
      usageEvents: true,
      notifications: true,
      webhookEndpoints: { omit: { secret: true } },
    },
  });

  if (!workspace) {
    throw new WorkspaceNotFoundForExportError(workspaceId);
  }

  return { exportedAt: new Date().toISOString(), workspace };
}

/**
 * GDPR/CCPA right to erasure (Art. 17) for a workspace's own data. Relies on the schema's
 * onDelete: Cascade on every workspace-scoped relation (see schema.prisma) to remove
 * searches/leads/discovery runs/etc. in one statement - deliberately not touching the
 * shared Investor/Contact/Deal graph, which isn't owned by any single workspace.
 */
export async function deleteWorkspace(prisma: PrismaClient, workspaceId: string): Promise<void> {
  await prisma.workspace.delete({ where: { id: workspaceId } });
}
