import type { PrismaClient } from "@prisma/client";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeLinkedInUrl(url: string): string {
  return url.toLowerCase().trim().replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "");
}

export interface SuppressionRequest {
  email?: string;
  linkedinUrl?: string;
  requestIp?: string;
}

export class InvalidSuppressionRequestError extends Error {
  constructor() {
    super("At least one of email or linkedinUrl is required");
    this.name = "InvalidSuppressionRequestError";
  }
}

export interface SuppressionResult {
  suppressionId: string;
  contactsPurged: number;
  networkContactsPurged: number;
}

/**
 * Deletes rows from a PII-bearing model whose stored linkedinUrl normalizes
 * to the target - linkedinUrl formatting varies too much (protocol, www,
 * trailing slash) for a direct column match, so this fetches candidates and
 * compares in application code, the same normalization warm-path matching
 * uses. Bounded to rows that actually have a linkedinUrl set.
 */
async function purgeByLinkedInUrl(
  findMany: (args: { where: { linkedinUrl: { not: null } }; select: { id: true; linkedinUrl: true } }) => Promise<
    { id: string; linkedinUrl: string | null }[]
  >,
  deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<{ count: number }>,
  target: string
): Promise<number> {
  const candidates = await findMany({ where: { linkedinUrl: { not: null } }, select: { id: true, linkedinUrl: true } });
  const ids = candidates.filter((c) => c.linkedinUrl && normalizeLinkedInUrl(c.linkedinUrl) === target).map((c) => c.id);
  if (ids.length === 0) return 0;
  const result = await deleteMany({ where: { id: { in: ids } } });
  return result.count;
}

/**
 * Right-to-erasure (GDPR Art. 17): records a durable, global Suppression
 * entry so future imports/enrichment never silently re-add this person,
 * then purges - not flags - their PII from every place we currently hold
 * it. Global by design (not workspace-scoped): the same investor Contact or
 * imported NetworkContact can exist under many workspaces, and erasure
 * means nobody's copy survives, not just one workspace's.
 *
 * ExclusionEntry rows are deliberately NOT purged: they exist specifically
 * to record "do not contact this person," which is the same intent behind
 * an erasure request. Deleting them would remove the very record that
 * keeps a founder from re-adding the person later.
 */
export async function recordSuppression(prisma: PrismaClient, request: SuppressionRequest): Promise<SuppressionResult> {
  const email = request.email ? normalizeEmail(request.email) : undefined;
  const linkedinUrl = request.linkedinUrl ? normalizeLinkedInUrl(request.linkedinUrl) : undefined;
  if (!email && !linkedinUrl) throw new InvalidSuppressionRequestError();

  const suppression = await prisma.suppression.create({
    data: { email, linkedinUrl, requestIp: request.requestIp },
  });

  let contactsPurged = 0;
  let networkContactsPurged = 0;

  if (email) {
    const [contactsByEmail, networkContactsByEmail] = await Promise.all([
      prisma.contact.deleteMany({ where: { email: { equals: email, mode: "insensitive" } } }),
      prisma.networkContact.deleteMany({ where: { email: { equals: email, mode: "insensitive" } } }),
    ]);
    contactsPurged += contactsByEmail.count;
    networkContactsPurged += networkContactsByEmail.count;
  }

  if (linkedinUrl) {
    contactsPurged += await purgeByLinkedInUrl(
      (args) => prisma.contact.findMany(args),
      (args) => prisma.contact.deleteMany(args),
      linkedinUrl
    );
    networkContactsPurged += await purgeByLinkedInUrl(
      (args) => prisma.networkContact.findMany(args),
      (args) => prisma.networkContact.deleteMany(args),
      linkedinUrl
    );
  }

  return { suppressionId: suppression.id, contactsPurged, networkContactsPurged };
}

/** Used by import/enrichment paths before writing PII, so an erased person doesn't come back. */
export async function isSuppressed(
  prisma: PrismaClient,
  params: { email?: string | null; linkedinUrl?: string | null }
): Promise<boolean> {
  const email = params.email ? normalizeEmail(params.email) : undefined;
  const linkedinUrl = params.linkedinUrl ? normalizeLinkedInUrl(params.linkedinUrl) : undefined;
  if (!email && !linkedinUrl) return false;

  if (email) {
    const emailMatch = await prisma.suppression.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (emailMatch) return true;
  }

  if (linkedinUrl) {
    const candidates = await prisma.suppression.findMany({
      where: { linkedinUrl: { not: null } },
      select: { linkedinUrl: true },
    });
    if (candidates.some((c) => c.linkedinUrl && normalizeLinkedInUrl(c.linkedinUrl) === linkedinUrl)) return true;
  }

  return false;
}

/**
 * Loads the full Suppression table once and returns a synchronous checker -
 * for bulk import paths (CSV rows) where calling isSuppressed() per row
 * would mean one round-trip per row. The Suppression table is expected to
 * stay small relative to import batch sizes.
 */
export async function loadSuppressionChecker(
  prisma: PrismaClient
): Promise<(params: { email?: string | null; linkedinUrl?: string | null }) => boolean> {
  const rows = await prisma.suppression.findMany({ select: { email: true, linkedinUrl: true } });
  const emails = new Set(rows.filter((r) => r.email).map((r) => r.email!));
  const linkedinUrls = new Set(rows.filter((r) => r.linkedinUrl).map((r) => r.linkedinUrl!));

  return (params) => {
    if (params.email && emails.has(normalizeEmail(params.email))) return true;
    if (params.linkedinUrl && linkedinUrls.has(normalizeLinkedInUrl(params.linkedinUrl))) return true;
    return false;
  };
}
