import type { PrismaClient } from "@prisma/client";
import type { OutreachRecipient } from "./outreach-destinations/types.js";

/** Flattens leads into OutreachRecipients: the investor's best contact (by
 * email verification, then whichever was added first), fit context, and
 * the most recent draft if one exists. */
export async function buildOutreachRecipients(prisma: PrismaClient, leadIds: string[]): Promise<OutreachRecipient[]> {
  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    include: {
      investor: { include: { contacts: { orderBy: [{ emailVerifiedAt: "desc" }, { createdAt: "asc" }] } } },
      outreachDrafts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return leads.map((lead) => {
    const contact = lead.investor.contacts[0] ?? null;
    const draft = lead.outreachDrafts[0] ?? null;
    return {
      leadId: lead.id,
      investorName: lead.investor.name,
      contactName: contact?.name ?? null,
      contactTitle: contact?.title ?? null,
      contactEmail: contact?.email ?? null,
      contactLinkedInUrl: contact?.linkedinUrl ?? null,
      fitScore: lead.fitScore,
      tier: lead.tier,
      firstLine: draft?.firstLine ?? null,
      emailSubject: draft?.subject ?? null,
      emailBody: draft?.body ?? null,
    };
  });
}
