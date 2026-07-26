/** A lead flattened into whatever an outreach destination needs to reach
 * out - contact identity, fit context, and the (optional) latest draft. */
export interface OutreachRecipient {
  leadId: string;
  investorName: string;
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
  contactLinkedInUrl: string | null;
  fitScore: number | null;
  tier: string | null;
  firstLine: string | null;
  emailSubject: string | null;
  emailBody: string | null;
}

export interface OutreachSendResult {
  destination: string;
  /** How many recipients were successfully included/sent. For CSV this is
   * "written to the file"; for a real integration, "accepted by the API". */
  succeeded: number;
  failed: number;
  /** Adapter-specific extra info - CSV's file content, an API error
   * summary, etc. */
  details?: string;
}

export interface OutreachDestination {
  readonly key: string;
  readonly name: string;
  /** false for typed stubs that don't actually call out anywhere yet. */
  readonly implemented: boolean;
  send(recipients: OutreachRecipient[], config?: Record<string, unknown>): Promise<OutreachSendResult>;
}

export class OutreachDestinationNotImplementedError extends Error {
  constructor(destinationName: string) {
    super(`${destinationName} integration is not implemented yet`);
    this.name = "OutreachDestinationNotImplementedError";
  }
}
