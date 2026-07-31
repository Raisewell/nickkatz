import type { FastifyInstance, FastifyRequest } from "fastify";

/** Throws a 403 unless the authenticated user owns or is a member of the
 * given workspace. Call this before touching any workspace-scoped data. */
export async function assertWorkspaceMember(
  fastify: FastifyInstance,
  request: FastifyRequest,
  workspaceId: string
): Promise<void> {
  const workspace = await fastify.prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [{ ownerId: request.user.id }, { members: { some: { userId: request.user.id } } }],
    },
    select: { id: true },
  });
  if (!workspace) throw fastify.httpErrors.forbidden("Not a member of this workspace");
}

/** Throws a 403 unless the authenticated user is the workspace's owner.
 * Billing actions (starting/managing a subscription) are owner-only - every
 * other workspace-scoped action only requires membership. */
export async function assertWorkspaceOwner(
  fastify: FastifyInstance,
  request: FastifyRequest,
  workspaceId: string
): Promise<void> {
  const workspace = await fastify.prisma.workspace.findFirst({
    where: { id: workspaceId, ownerId: request.user.id },
    select: { id: true },
  });
  if (!workspace) throw fastify.httpErrors.forbidden("Only the workspace owner can manage billing");
}

/** Same check, but for a batch of leads that may span workspaces (e.g.
 * outreach send/export takes a raw leadIds array) - every lead's workspace
 * must belong to the caller, or the whole request is rejected. */
export async function assertLeadsAccessible(
  fastify: FastifyInstance,
  request: FastifyRequest,
  leadIds: string[]
): Promise<void> {
  const count = await fastify.prisma.lead.count({
    where: {
      id: { in: leadIds },
      workspace: {
        OR: [{ ownerId: request.user.id }, { members: { some: { userId: request.user.id } } }],
      },
    },
  });
  if (count !== leadIds.length) throw fastify.httpErrors.forbidden("Not authorized for one or more leads");
}
