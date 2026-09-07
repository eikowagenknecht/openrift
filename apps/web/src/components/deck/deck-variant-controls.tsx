import { ChevronRightIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CountPillButton } from "@/components/ui/count-pill";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeckFamilyEntry } from "@/lib/deck-family";
import { cn } from "@/lib/utils";

// z-10 keeps this above the row's stretched-link overlay so its clicks register.
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

// Renders as a span, like `LocalDeckBadge`, so it adds no tab stop to a row
// that already has one for the deck itself.
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
