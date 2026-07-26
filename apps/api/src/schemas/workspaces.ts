import { z } from "zod";

export const workspaceMemberSchema = z.object({
  id: z.string(),
  role: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string(),
  }),
});

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  plan: z.string(),
  usageLimit: z.number(),
  companyOneLiner: z.string().nullable(),
  ownerId: z.string(),
  members: z.array(workspaceMemberSchema),
});
