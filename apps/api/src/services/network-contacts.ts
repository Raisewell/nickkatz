import type { PrismaClient } from "@prisma/client";
import { parseExclusionCsv } from "./csv-import.js";
import { loadSuppressionChecker } from "./suppression.js";

function parseConnectedOn(raw: string | undefined): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Imports a LinkedIn Connections.csv (or generic CSV) into the workspace's
 * NetworkContact list - the founder's own network, used to compute direct
 * warm paths. Reuses the same parser as exclusion-list import since it's
 * the same file format; the only difference is what we do with the rows.
 * Rows matching a Suppression entry are silently dropped rather than
 * imported, so someone who exercised their right to erasure doesn't get
 * re-added the next time a founder imports their connections. */
export async function importNetworkContactsCsv(
  prisma: PrismaClient,
  workspaceId: string,
  raw: string
): Promise<{ detectedFormat: "linkedin_import" | "csv"; rowsParsed: number; contactsCreated: number }> {
  const { rows, detectedFormat } = parseExclusionCsv(raw);

  if (rows.length === 0) {
    return { detectedFormat, rowsParsed: 0, contactsCreated: 0 };
  }

  const isSuppressed = await loadSuppressionChecker(prisma);
  const allowedRows = rows.filter((r) => !isSuppressed({ email: r.email, linkedinUrl: r.linkedinUrl }));

  if (allowedRows.length > 0) {
    await prisma.networkContact.createMany({
      data: allowedRows.map((r) => ({
        workspaceId,
        name: r.name ?? "Unknown",
        email: r.email,
        linkedinUrl: r.linkedinUrl,
        source: detectedFormat === "linkedin_import" ? ("LINKEDIN_IMPORT" as const) : ("CSV_IMPORT" as const),
        connectedAt: parseConnectedOn(r.connectedOn),
      })),
    });
  }

  return { detectedFormat, rowsParsed: rows.length, contactsCreated: allowedRows.length };
}
