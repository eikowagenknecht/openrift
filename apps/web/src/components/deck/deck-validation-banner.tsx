import type { DeckViolation } from "@openrift/shared";
import { CircleAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Badge showing a click-to-open popover listing each violation. Purely
 * presentational, so the hero can reuse it on surfaces (public share page)
 * where owner-only deck hooks must never run.
 * @returns The violation badge element.
 */
export function ViolationBadge({
  formatLabel,
  violations,
  progress,
}: {
  formatLabel: string;
  violations: DeckViolation[];
  /**
   * Build progress ("48/56") shown after the format label while the deck is
   * still incomplete — the hero folded its separate cards chip into this badge.
   */
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
