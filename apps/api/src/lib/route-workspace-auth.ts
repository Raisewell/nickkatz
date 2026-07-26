import type { FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { resolveWorkspaceAccess, WorkspaceForbiddenError, WorkspaceNotFoundError } from "./workspace-auth.js";

/**
 * Route-layer wrapper around resolveWorkspaceAccess: on success returns a
 * workspace-scoped Prisma client; on failure sends the right HTTP response
 * itself (404 for an unknown workspace, 403 for a real-but-not-yours one)
 * and returns undefined, so the caller's handler can just do:
 *
 *   const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, userId, reply);
 *   if (!db) return;
 *   ...use db for every workspace-scoped query from here on...
 */
export async function scopedPrismaOrReject(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
  reply: FastifyReply
): Promise<PrismaClient | undefined> {
  try {
    return await resolveWorkspaceAccess(prisma, workspaceId, userId);
  } catch (err) {
    if (err instanceof WorkspaceNotFoundError) {
      reply.notFound(err.message);
      return undefined;
    }
    if (err instanceof WorkspaceForbiddenError) {
      reply.forbidden(err.message);
      return undefined;
    }
    throw err;
  }
}
