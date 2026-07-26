import type { OutreachDestination, OutreachRecipient, OutreachSendResult } from "./types.js";

const COLUMNS = [
  "Investor",
  "Contact Name",
  "Title",
  "Email",
  "LinkedIn URL",
  "Fit Score",
  "Tier",
  "First Line",
  "Email Subject",
  "Email Body",
] as const;

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toRow(recipient: OutreachRecipient): string {
  const values = [
    recipient.investorName,
    recipient.contactName ?? "",
    recipient.contactTitle ?? "",
    recipient.contactEmail ?? "",
    recipient.contactLinkedInUrl ?? "",
    recipient.fitScore != null ? String(recipient.fitScore) : "",
    recipient.tier ?? "",
    recipient.firstLine ?? "",
    recipient.emailSubject ?? "",
    recipient.emailBody ?? "",
  ];
  return values.map(escapeCsvValue).join(",");
}

export function buildOutreachCsv(recipients: OutreachRecipient[]): string {
  const lines = [COLUMNS.join(","), ...recipients.map(toRow)];
  return lines.join("\r\n") + "\r\n";
}

/** Always available - no external account needed. The CSV content is
 * returned in `details` for programmatic callers; the HTTP route serves it
 * as a `text/csv` download directly rather than round-tripping through
 * JSON. */
export const csvDestination: OutreachDestination = {
  key: "csv",
  name: "CSV Export",
  implemented: true,
  async send(recipients: OutreachRecipient[]): Promise<OutreachSendResult> {
    const csv = buildOutreachCsv(recipients);
    return { destination: "csv", succeeded: recipients.length, failed: 0, details: csv };
  },
};
