"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  exportOutreachCsv,
  listOutreachDestinations,
  sendOutreach,
  type OutreachDestinationInfo,
} from "@/lib/api";
import { useSession } from "@/lib/session";

export function OutreachActionBar({ leadIds, onClear }: { leadIds: string[]; onClear: () => void }) {
  const { session } = useSession();
  const [destinations, setDestinations] = useState<OutreachDestinationInfo[]>([]);
  const [destination, setDestination] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOutreachDestinations()
      .then((list) => {
        const sendable = list.filter((d) => d.key !== "csv");
        setDestinations(sendable);
        setDestination((current) => current || sendable[0]?.key || "");
      })
      .catch(() => {});
  }, []);

  async function handleExportCsv() {
    if (!session) return;
    setError(null);
    setExporting(true);
    try {
      const blob = await exportOutreachCsv({ workspaceId: session.workspaceId, leadIds });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "raisely-outreach-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't export those leads.");
    } finally {
      setExporting(false);
    }
  }

  async function handleSend() {
    if (!session || !destination) return;
    setError(null);
    setMessage(null);
    setSending(true);
    try {
      const config = destination === "heyreach" && campaignId ? { campaignId: Number(campaignId) } : undefined;
      const result = await sendOutreach({ workspaceId: session.workspaceId, destination, leadIds, config });
      setMessage(
        `${result.succeeded} sent, ${result.failed} failed${result.details ? ` - ${result.details}` : ""}`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send those leads.");
    } finally {
      setSending(false);
    }
  }

  const selectedDestination = destinations.find((d) => d.key === destination);
  const sendDisabled =
    sending || !destination || !selectedDestination?.implemented || (destination === "heyreach" && !campaignId);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
      <span className="shrink-0 font-medium">
        {leadIds.length} selected
      </span>

      <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={exporting}>
        {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Export to CSV"}
      </Button>

      {destinations.length > 0 && (
        <>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {destinations.map((d) => (
              <option key={d.key} value={d.key} disabled={!d.implemented}>
                {d.name}
                {!d.implemented ? " (coming soon)" : ""}
              </option>
            ))}
          </select>

          {destination === "heyreach" && (
            <Input
              type="number"
              placeholder="Campaign ID"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="h-8 w-32 text-xs"
            />
          )}

          <Button size="sm" onClick={handleSend} disabled={sendDisabled}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send"}
          </Button>
        </>
      )}

      <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto gap-1">
        <X className="h-3.5 w-3.5" />
        Clear
      </Button>

      {message && <p className="w-full text-xs text-emerald-700">{message}</p>}
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
