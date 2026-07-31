import type { PrismaClient } from "@prisma/client";
import { getWorkspaceScopedPrisma } from "./workspace-scope.js";

export class WorkspaceNotFoundError extends Error {
  constructor(workspaceId: string) {
    super(`Workspace ${workspaceId} not found`);
    this.name = "WorkspaceNotFoundError";
  }
}

export class WorkspaceForbiddenError extends Error {
  constructor(workspaceId: string) {
    super(`Not authorized for workspace ${workspaceId}`);
    this.name = "WorkspaceForbiddenError";
  }
}

/**
 * Verifies userId is actually allowed to act within workspaceId (its owner,
 * or a row in WorkspaceMember) before any workspace-scoped data access
 * happens. userId comes from the verified bearer token (request.user.id,
 * set by plugins/auth.ts from a session-derived JWT) at every call site -
 * never from client-supplied body/query input - so this check is genuine
 * authorization on top of real authentication, not just a narrowing of who
 * a claimed identity is allowed to be.
 */
export async function assertWorkspaceMembership(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string
): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  if (!workspace) {
    throw new WorkspaceNotFoundError(workspaceId);
  }
  if (workspace.ownerId === userId) return;

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) {
    throw new WorkspaceForbiddenError(workspaceId);
  }
}

/**
 * The one-stop call route handlers should use: checks membership, then
 * returns a Prisma client scoped to that workspace (see
 * getWorkspaceScopedPrisma). Throws WorkspaceNotFoundError or
 * WorkspaceForbiddenError before any data access if the check fails.
 */
export async function resolveWorkspaceAccess(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string
): Promise<PrismaClient> {
  await assertWorkspaceMembership(prisma, workspaceId, userId);
  return getWorkspaceScopedPrisma(prisma, workspaceId);
}
