"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NewDiscoveryForm({ onCreated }: { onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const { currentWorkspaceId } = useWorkspace();
  const [companiesText, setCompaniesText] = useState("");

  const companies = companiesText
    .split(/[\n,]/)
    .map((c) => c.trim())
    .filter(Boolean);

  const createMutation = useMutation({
    mutationFn: () => {
      if (!currentWorkspaceId) throw new Error("No workspace selected");
      return api.createDiscoveryRun({ workspaceId: currentWorkspaceId, comparableCompanies: companies });
    },
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["discovery-runs", currentWorkspaceId] });
      setCompaniesText("");
      onCreated(run.id);
    },
  });

  const valid = companies.length >= 3 && companies.length <= 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find lookalike investors</CardTitle>
        <CardDescription>
          List 3-10 companies comparable to yours. We&apos;ll find investors who backed them directly, then
          expand one hop via their co-investment graph.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={5}
          value={companiesText}
          onChange={(e) => setCompaniesText(e.target.value)}
          placeholder={"Stripe\nRamp\nBrex"}
        />
        <p className="text-xs text-muted-foreground">
          {companies.length} of 3-10 companies{companies.length > 0 ? `: ${companies.join(", ")}` : ""}
        </p>
        {createMutation.isError && (
          <p className="text-sm text-destructive">{(createMutation.error as Error).message}</p>
        )}
        <Button disabled={!valid || !currentWorkspaceId || createMutation.isPending} onClick={() => createMutation.mutate()}>
          {createMutation.isPending ? "Starting..." : "Start discovery"}
        </Button>
      </CardContent>
    </Card>
  );
}
