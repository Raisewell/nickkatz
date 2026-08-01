"use client";

import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Providers = Awaited<ReturnType<typeof getProviders>>;

export function SignInForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [providers, setProviders] = useState<Providers>(null);
  const [email, setEmail] = useState("");
  const [devEmail, setDevEmail] = useState("founder@demo.raisely.dev");
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    getProviders().then(setProviders);
  }, []);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in to Raisely</CardTitle>
        <CardDescription>Investor discovery and fundraising CRM.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {providers?.google && (
          <Button className="w-full" onClick={() => signIn("google", { callbackUrl })}>
            Sign in with Google
          </Button>
        )}

        {providers?.nodemailer && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              signIn("nodemailer", { email, callbackUrl, redirect: false }).then(() => setSentTo(email));
            }}
          >
            <label className="text-sm font-medium">Email me a sign-in link</label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            <Button type="submit" variant="secondary" className="w-full">
              Send magic link
            </Button>
            {sentTo && <p className="text-xs text-muted-foreground">Check {sentTo} for a sign-in link.</p>}
          </form>
        )}

        {providers?.["dev-login"] && (
          <form
            className="space-y-2 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              signIn("dev-login", { email: devEmail, callbackUrl });
            }}
          >
            <label className="text-sm font-medium">Dev login (no real auth configured)</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
            >
              <option value="founder@demo.raisely.dev">founder@demo.raisely.dev (Jamie Founder)</option>
              <option value="advisor@demo.raisely.dev">advisor@demo.raisely.dev (Riley Advisor)</option>
            </select>
            <Button type="submit" variant="outline" className="w-full">
              Continue
            </Button>
          </form>
        )}

        {providers && Object.keys(providers).length === 0 && (
          <p className="text-sm text-destructive">
            No auth providers are configured. Set GOOGLE_CLIENT_ID/SECRET, EMAIL_SERVER, or
            AUTH_ENABLE_DEV_LOGIN.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
