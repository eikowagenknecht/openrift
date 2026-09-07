import type { DeckViolation } from "@openrift/shared/deck-rules";
import { CircleAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Purely presentational: reused on surfaces (public share page) where owner-only deck hooks must never run.
export function ViolationBadge({
  formatLabel,
  violations,
  progress,
}: {
  formatLabel: string;
  violations: DeckViolation[];
  progress?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger nativeButton={false} render={<span />}>
        <Badge variant="warning" className="shrink-0 cursor-pointer rounded-md">
          {formatLabel}
          {progress && <span className="tabular-nums">· {progress}</span>}
          <CircleAlertIcon className="size-3" />
        </Badge>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-auto max-w-80 p-2">
        <ul className="space-y-0.5">
          {/* Per-card codes repeat across cards, so the key needs the card. */}
          {violations.map((violation) => (
            <li key={`${violation.code}-${violation.cardId ?? "deck"}`} className="text-xs">
              {violation.message}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
