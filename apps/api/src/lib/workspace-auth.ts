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
 * Verifies the claimed userId is actually allowed to act within the claimed
 * workspaceId (its owner, or a row in WorkspaceMember) before any
 * workspace-scoped data access happens.
 *
 * Scope/limitation, stated plainly: this is NOT session authentication -
 * userId is still a client-supplied value (see the TODO(auth) comments
 * throughout the route layer; Auth.js session wiring hasn't landed yet).
 * Without this check, ANY caller who merely knows a workspaceId can act as
 * any user against it. With it, they must ALSO supply a userId that is a
 * real, verified member of that specific workspace - a meaningful
 * narrowing of the attack surface, not a complete fix. Once real session
 * auth lands, userId should come from the verified session instead of the
 * request body/query, and this function's job doesn't change - same
 * membership check, just a trusted input instead of a claimed one.
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
