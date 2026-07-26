"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function OutreachDraftModal({
  leadId,
  investorName,
  open,
  onClose,
}: {
  leadId: string;
  investorName: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const [subject, setSubject] = useState("");
  const [firstLine, setFirstLine] = useState("");
  const [body, setBody] = useState("");
  const [sendResult, setSendResult] = useState<string | null>(null);

  const { data: drafts, isLoading } = useQuery({
    queryKey: ["outreach-drafts", leadId],
    queryFn: () => api.listDrafts(leadId),
    enabled: open,
  });

  const draft = drafts?.[0];

  useEffect(() => {
    if (draft) {
      setSubject(draft.subject);
      setFirstLine(draft.firstLine);
      setBody(draft.body);
    }
  }, [draft]);

  const createMutation = useMutation({
    mutationFn: () => api.draftOutreach(leadId, currentWorkspace?.companyOneLiner ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outreach-drafts", leadId] }),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("No draft to save");
      return api.patchDraft(draft.id, { subject, firstLine, body });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outreach-drafts", leadId] }),
  });

  const sendMutation = useMutation({
    mutationFn: async (destination: string) => {
      if (destination === "csv") {
        const blob = await api.exportOutreachCsv([leadId]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "raisely-outreach-export.csv";
        a.click();
        URL.revokeObjectURL(url);
        return { destination: "csv", succeeded: 1, failed: 0 };
      }
      return api.sendOutreach({ destination, leadIds: [leadId] });
    },
    onSuccess: (result) => setSendResult(`${result.destination}: ${result.succeeded} sent, ${result.failed} failed`),
    onError: (err: Error) => setSendResult(err.message),
  });

  return (
    <Modal open={open} onClose={onClose} title={`Outreach - ${investorName}`}>
      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!isLoading && !draft && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No draft yet. Claude can write a personalized first line and email from this lead&apos;s fit evidence.
          </p>
          <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Drafting..." : "Draft outreach"}
          </Button>
        </div>
      )}
      {draft && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">First line</label>
            <Textarea rows={2} value={firstLine} onChange={(e) => setFirstLine(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Body</label>
            <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving..." : "Save edits"}
            </Button>
            <Button size="sm" disabled={sendMutation.isPending} onClick={() => sendMutation.mutate("csv")}>
              Export CSV
            </Button>
            <Button size="sm" disabled={sendMutation.isPending} onClick={() => sendMutation.mutate("heyreach")}>
              Send via HeyReach
            </Button>
          </div>
          {sendResult && <p className="text-xs text-muted-foreground">{sendResult}</p>}
        </div>
      )}
    </Modal>
  );
}
