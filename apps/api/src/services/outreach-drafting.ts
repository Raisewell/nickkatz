import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { FitScoreResult } from "@raisely/shared-types";
import {
  extractTextBlock,
  getAnthropicClient,
  getAnthropicModel,
  stripMarkdownFences,
  withRetry,
} from "../lib/anthropic.js";

const SYSTEM_PROMPT = `You write a short, specific outreach first line and email a founder can send to an investor, based on structured fit evidence about why that investor is a good match.

Reference real specifics from the evidence given (thesis language, recent deals, geography, etc) - never invent facts that aren't in the evidence. No generic flattery ("I've been following your amazing work"). Keep the first line under 200 characters and the email body under 120 words.

Respond with ONLY a single JSON object, no prose, no markdown fences, matching this shape exactly:
{ "firstLine": string, "subject": string, "body": string }`;

const draftResponseSchema = z.object({
  firstLine: z.string().min(1).max(400),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
});

export type DraftContent = z.infer<typeof draftResponseSchema>;

export interface DraftOutreachParams {
  leadId: string;
  companyOneLiner?: string;
}

/** Best-effort draft when Claude is unavailable or returns something we
 * can't validate. Generic but never fabricates - it only uses the
 * investor's real name and the founder's own one-liner. */
function fallbackDraft(investorName: string, companyOneLiner: string | null): DraftContent {
  const oneLiner = companyOneLiner ?? "our company";
  return {
    firstLine: `Reaching out about ${oneLiner} - thought ${investorName} could be a strong fit.`,
    subject: `Quick intro - ${oneLiner}`,
    body: `Hi,\n\nI'm building ${oneLiner}. Given ${investorName}'s focus, I wanted to reach out directly.\n\nWould you be open to a short call in the next couple of weeks?\n\nBest`,
  };
}

/**
 * Drafts a personalized first line + short email for a lead, using its fit
 * evidence and the founder's company one-liner (passed explicitly, or
 * falling back to the workspace's saved one). Always persisted as an
 * OutreachDraft for the user to review and edit - this never sends
 * anything anywhere.
 */
export async function draftOutreach(prisma: PrismaClient, params: DraftOutreachParams) {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: params.leadId },
    include: { investor: true, workspace: true },
  });

  const companyOneLiner = params.companyOneLiner ?? lead.workspace.companyOneLiner ?? null;
  const fitReasons = lead.fitReasons as unknown as FitScoreResult | null;

  const client = getAnthropicClient();
  let draft: DraftContent;

  if (!client) {
    draft = fallbackDraft(lead.investor.name, companyOneLiner);
  } else {
    try {
      draft = await withRetry(async () => {
        const evidenceLines = (fitReasons?.components ?? [])
          .filter((c) => c.points > 0)
          .map((c) => `- ${c.factor}: ${c.evidence}`)
          .join("\n");

        const context = [
          `Investor: ${lead.investor.name}`,
          lead.investor.thesis ? `Thesis: ${lead.investor.thesis}` : null,
          `Founder's company one-liner: ${companyOneLiner ?? "(not provided - keep it generic on this point)"}`,
          evidenceLines ? `Fit evidence for this investor:\n${evidenceLines}` : null,
        ]
          .filter(Boolean)
          .join("\n\n");

        const message = await client.messages.create({
          model: getAnthropicModel(),
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: context }],
        });

        const cleaned = stripMarkdownFences(extractTextBlock(message));
        return draftResponseSchema.parse(JSON.parse(cleaned));
      });
    } catch {
      draft = fallbackDraft(lead.investor.name, companyOneLiner);
    }
  }

  return prisma.outreachDraft.create({
    data: { leadId: params.leadId, firstLine: draft.firstLine, subject: draft.subject, body: draft.body },
  });
}

export interface UpdateOutreachDraftParams {
  firstLine?: string;
  subject?: string;
  body?: string;
}

/** The user editing a draft before ever sending it - the only path from a
 * draft to something that could be sent goes through an explicit review. */
export async function updateOutreachDraft(prisma: PrismaClient, draftId: string, params: UpdateOutreachDraftParams) {
  return prisma.outreachDraft.update({ where: { id: draftId }, data: params });
}
