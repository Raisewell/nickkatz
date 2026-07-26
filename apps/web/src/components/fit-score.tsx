"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FitScoreResult } from "@raisely/shared-types";
import { Badge } from "@/components/ui/badge";

const FLAG_VARIANT = {
  conflict: "destructive",
  warning: "warning",
  info: "secondary",
} as const;

export function FitScore({ fitScore, fitReasons }: { fitScore: number | null; fitReasons: FitScoreResult | null }) {
  const [open, setOpen] = useState(false);

  if (fitScore === null || !fitReasons) {
    return <span className="text-sm text-muted-foreground">Not scored yet</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-sm font-semibold"
      >
        {fitScore}
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {fitReasons.flags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {fitReasons.flags.map((flag, i) => (
            <Badge key={i} variant={FLAG_VARIANT[flag.type]} className="text-[10px]">
              {flag.detail}
            </Badge>
          ))}
        </div>
      )}
      {open && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {fitReasons.components.map((c, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">
                {c.factor} ({c.points}/{c.max})
              </span>
              : {c.evidence}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
