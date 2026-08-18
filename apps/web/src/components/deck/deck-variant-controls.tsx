import { ChevronRightIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CountPillButton } from "@/components/ui/count-pill";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeckFamilyEntry } from "@/lib/deck-family";
import { cn } from "@/lib/utils";

// The two variant affordances the deck list's row and tile both carry (ADR-042),
// kept together so the list and the grid can't drift apart on wording or state.

/**
 * The expand control on a family's front entry. The row and the tile are
 * stretched-link surfaces, so this sits above the link overlay to take its own
 * clicks rather than cancelling the row's navigation after the fact.
 * @returns The toggle pill.
 */
export function VariantCountToggle({
  family,
  onToggle,
  className,
}: {
  family: DeckFamilyEntry;
  onToggle: (familyId: string) => void;
  className?: string;
}) {
  return (
    <CountPillButton
      className={cn("relative z-10 shrink-0", className)}
      aria-expanded={family.expanded}
      aria-label={family.expanded ? "Hide variants" : "Show variants"}
      onClick={() => {
        onToggle(family.id);
      }}
    >
      <ChevronRightIcon
        className={cn("size-3 transition-transform", family.expanded && "rotate-90")}
      />
      {family.memberCount} variants
    </CountPillButton>
  );
}

/**
 * The draft marker. Like `LocalDeckBadge` it renders as a span, so it adds no
 * tab stop to a row that already has one for the deck itself.
 * @returns The draft badge.
 */
export function DraftBadge({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="muted" className={cn("shrink-0", className)} />}>
        Draft
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-center">
        Marked as a work in progress. Everything else about the deck works as usual.
      </TooltipContent>
    </Tooltip>
  );
}
