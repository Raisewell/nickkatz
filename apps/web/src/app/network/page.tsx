"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Upload, Users } from "lucide-react";
import { Protected } from "@/components/protected";
import { Button } from "@/components/ui/button";
import { importNetworkContacts } from "@/lib/api";
import { useSession } from "@/lib/session";

function NetworkImport() {
  const { session } = useSession();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ rowsParsed: number; contactsCreated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!session) return;
    setUploading(true);
    setError(null);
    try {
      const res = await importNetworkContacts({ workspaceId: session.workspaceId, userId: session.userId }, file);
      setResult(res);
    } catch {
      setError("Couldn't import that file - make sure it's a CSV.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Import your LinkedIn connections (Settings → Data privacy → Get a copy of your data → Connections.csv), or any
        CSV with name/email/LinkedIn columns. We match it against every lead&apos;s investor contacts to surface warm
        intro paths - never sent anywhere, only used to compute matches.
      </p>

      <input
        ref={fileInput}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <Button className="mt-4 gap-2" onClick={() => fileInput.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Import connections CSV
      </Button>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="font-medium">
            Imported {result.contactsCreated} of {result.rowsParsed} contacts.
          </p>
          <p className="mt-1 text-muted-foreground">
            Head to your <Link href="/pipeline" className="underline">pipeline</Link> and click &quot;Find warm
            intros&quot; on any lead to check for matches.
          </p>
        </div>
      )}

      {!result && (
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-5 w-5" />
          No connections imported yet.
        </div>
      )}
    </div>
  );
}

export default function NetworkPage() {
  return (
    <Protected>
      <h1 className="text-xl font-semibold">Your network</h1>
      <p className="mt-1 text-sm text-muted-foreground">Import connections to unlock warm intro paths.</p>
      <div className="mt-6">
        <NetworkImport />
      </div>
    </Protected>
  );
}
