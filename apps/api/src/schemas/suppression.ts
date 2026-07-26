import { z } from "zod";

export const optOutBodySchema = z
  .object({
    email: z.string().email().optional(),
    linkedinUrl: z.string().url().optional(),
  })
  .refine((body) => body.email || body.linkedinUrl, {
    message: "At least one of email or linkedinUrl is required",
  });

export const optOutResponseSchema = z.object({
  status: z.literal("acknowledged"),
  message: z.string(),
});
