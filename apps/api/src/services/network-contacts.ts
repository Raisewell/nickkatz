import type { PrismaClient } from "@prisma/client";
import { parseExclusionCsv } from "./csv-import.js";

function parseConnectedOn(raw: string | undefined): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Imports a LinkedIn Connections.csv (or generic CSV) into the workspace's
 * NetworkContact list - the founder's own network, used to compute direct
 * warm paths. Reuses the same parser as exclusion-list import since it's
 * the same file format; the only difference is what we do with the rows. */
export async function importNetworkContactsCsv(
  prisma: PrismaClient,
  workspaceId: string,
  raw: string
): Promise<{ detectedFormat: "linkedin_import" | "csv"; rowsParsed: number; contactsCreated: number }> {
  const { rows, detectedFormat } = parseExclusionCsv(raw);

  if (rows.length === 0) {
    return { detectedFormat, rowsParsed: 0, contactsCreated: 0 };
  }

  await prisma.networkContact.createMany({
    data: rows.map((r) => ({
      workspaceId,
      name: r.name ?? "Unknown",
      email: r.email,
      linkedinUrl: r.linkedinUrl,
      source: detectedFormat === "linkedin_import" ? ("LINKEDIN_IMPORT" as const) : ("CSV_IMPORT" as const),
      connectedAt: parseConnectedOn(r.connectedOn),
    })),
  });

  return { detectedFormat, rowsParsed: rows.length, contactsCreated: rows.length };
}
