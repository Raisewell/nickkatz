"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function fetchApiHealth() {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error("API is unreachable");
  return (await res.json()) as { status: string; timestamp: string };
}

export default function Home() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["api-health"],
    queryFn: fetchApiHealth,
    retry: false,
  });

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-8 py-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Raisely</h1>
        <p className="mt-2 text-muted-foreground">
          Investor discovery and fundraising CRM. Explainable fit scores, warm paths, and outreach in one place.
        </p>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>API status</CardTitle>
          <CardDescription>Connectivity check to the Fastify backend.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <span className="text-sm">
            {isLoading && "Checking..."}
            {isError && "Unreachable - is the API running?"}
            {data && `${data.status} - ${new Date(data.timestamp).toLocaleTimeString()}`}
          </span>
          <Button size="sm" variant="outline" asChild>
            <a href={`${API_URL}/health`} target="_blank" rel="noreferrer">
              View raw
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
