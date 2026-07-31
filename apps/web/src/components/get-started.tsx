"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/session";

export function CreateWorkspace() {
  const { createFirstWorkspace, loading } = useSession();
  const [companyOneLiner, setCompanyOneLiner] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createFirstWorkspace({ companyOneLiner: companyOneLiner || undefined });
    } catch {
      setError("Couldn't reach the Raisely API. Is it running?");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-24">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Find investors who <span className="text-primary underline decoration-4 underline-offset-4">actually fit</span> your round.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Describe your raise in plain English. Get ranked matches with the evidence behind every score — and warm
          intro paths where you already have one.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-3 text-left">
          <div>
            <label htmlFor="oneliner" className="text-sm font-medium">
              What are you building? <span className="font-normal text-muted-foreground">(optional, sharpens your outreach)</span>
            </label>
            <Input
              id="oneliner"
              value={companyOneLiner}
              onChange={(e) => setCompanyOneLiner(e.target.value)}
              placeholder="Payments infrastructure for SMB marketplaces"
              className="mt-1"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full gap-2" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Start finding investors
          </Button>
        </form>
      </div>
    </main>
  );
}
