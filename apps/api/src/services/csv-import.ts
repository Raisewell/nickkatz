import { parse } from "csv-parse/sync";

export interface ParsedExclusionRow {
  name?: string;
  email?: string;
  linkedinUrl?: string;
}

// LinkedIn's "Connections.csv" export starts with a few "Notes:" preamble
// lines before the real header row, so we scan for the header instead of
// assuming line 0.
const LINKEDIN_HEADER_MARKERS = ["first name", "last name", "url"];

function findLinkedInHeaderLineIndex(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const lower = lines[i].toLowerCase();
    if (LINKEDIN_HEADER_MARKERS.every((marker) => lower.includes(marker))) {
      return i;
    }
  }
  return -1;
}

export function isLinkedInConnectionsExport(raw: string): boolean {
  return findLinkedInHeaderLineIndex(raw.split(/\r?\n/)) >= 0;
}

export function parseLinkedInConnectionsCsv(raw: string): ParsedExclusionRow[] {
  const lines = raw.split(/\r?\n/);
  const headerIdx = findLinkedInHeaderLineIndex(lines);
  const csvBody = (headerIdx >= 0 ? lines.slice(headerIdx) : lines).join("\n");

  const records = parse(csvBody, {
    columns: (header: string[]) => header.map((h) => h.trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  return records
    .map((r) => {
      const name = `${r["First Name"] ?? ""} ${r["Last Name"] ?? ""}`.trim();
      const email = (r["Email Address"] ?? "").trim();
      const linkedinUrl = (r["URL"] ?? "").trim();
      return {
        name: name || undefined,
        email: email || undefined,
        linkedinUrl: linkedinUrl || undefined,
      };
    })
    .filter((r) => r.name || r.email || r.linkedinUrl);
}

const GENERIC_COLUMN_ALIASES: Record<keyof ParsedExclusionRow, string[]> = {
  name: ["name", "full name", "fullname"],
  email: ["email", "email address", "e-mail"],
  linkedinUrl: ["linkedin", "linkedin url", "url", "profile url"],
};

function findColumn(header: string[], aliases: string[]): string | undefined {
  const lowerHeader = header.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lowerHeader.indexOf(alias);
    if (idx >= 0) return header[idx];
  }
  return undefined;
}

export function parseGenericExclusionCsv(raw: string): ParsedExclusionRow[] {
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  if (records.length === 0) return [];
  const header = Object.keys(records[0]);
  const nameCol = findColumn(header, GENERIC_COLUMN_ALIASES.name);
  const emailCol = findColumn(header, GENERIC_COLUMN_ALIASES.email);
  const linkedinCol = findColumn(header, GENERIC_COLUMN_ALIASES.linkedinUrl);

  return records
    .map((r) => ({
      name: nameCol ? r[nameCol]?.trim() || undefined : undefined,
      email: emailCol ? r[emailCol]?.trim() || undefined : undefined,
      linkedinUrl: linkedinCol ? r[linkedinCol]?.trim() || undefined : undefined,
    }))
    .filter((r) => r.name || r.email || r.linkedinUrl);
}

export function parseExclusionCsv(raw: string): {
  rows: ParsedExclusionRow[];
  detectedFormat: "linkedin_import" | "csv";
} {
  if (isLinkedInConnectionsExport(raw)) {
    return { rows: parseLinkedInConnectionsCsv(raw), detectedFormat: "linkedin_import" };
  }
  return { rows: parseGenericExclusionCsv(raw), detectedFormat: "csv" };
}
