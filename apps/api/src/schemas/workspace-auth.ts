import { z } from "zod";

/** For GET/DELETE routes where workspace context travels in the query
 * string. The caller's identity now comes from the verified bearer token
 * (request.user.id, set by plugins/auth.ts) - this schema only carries
 * which workspace they claim to act in; lib/workspace-auth.ts still checks
 * that request.user.id is really a member of it. */
export const workspaceAuthQuerySchema = z.object({
  workspaceId: z.string().min(1),
});
