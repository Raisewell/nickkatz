"use client";

import { Protected } from "@/components/protected";
import { PipelineBoard } from "@/components/pipeline-board";

export default function PipelinePage() {
  return (
    <Protected>
      <h1 className="text-xl font-semibold">Pipeline</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your best-fit leads across every search, by stage (top 200 by fit score).</p>
      <div className="mt-6">
        <PipelineBoard />
      </div>
    </Protected>
  );
}
