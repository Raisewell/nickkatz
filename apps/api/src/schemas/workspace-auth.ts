import { z } from "zod";

/** For GET/DELETE routes where workspace context travels in the query
 * string. Every by-ID route in the app requires both: which workspace the
 * caller claims to act in, and which user they claim to be (checked
 * against WorkspaceMember - see lib/workspace-auth.ts for what this does
 * and does not guarantee before real session auth lands). */
export const workspaceAuthQuerySchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
});
