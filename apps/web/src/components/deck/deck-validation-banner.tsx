import type { DeckViolation } from "@openrift/shared";
import { CheckIcon, CircleAlertIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDeckCards, useDeckViolations } from "@/hooks/use-deck-builder";
import { useDeckDetail } from "@/hooks/use-decks";

/**
 * Badge showing a click-to-open popover listing each violation.
 * @returns The violation badge element.
 */
function ViolationBadge({ violations }: { violations: DeckViolation[] }) {
  return (
    <Popover>
      <PopoverTrigger nativeButton={false} render={<span />}>
        <span className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Constructed
          <CircleAlertIcon className="size-3" />
        </span>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-auto max-w-80 p-2">
        <ul className="space-y-0.5">
          {violations.map((violation) => (
            <li key={violation.code} className="text-xs">
              {violation.message}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Format badge showing "Constructed ✓", "Freeform", or violation count.
 * @returns The format badge element.
 */
export function DeckFormatBadge({ deckId }: { deckId: string }) {
  const { data: deckDetail } = useDeckDetail(deckId);
  const format = deckDetail.deck.format;
  const violations = useDeckViolations(deckId, format);
  const cards = useDeckCards(deckId);
  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);

  const isValid = format === "freeform" || violations.length === 0;

  if (isValid) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
        {format === "freeform" ? "Freeform" : "Constructed"}
        <CheckIcon className="size-3" />
      </span>
    );
  }

  // Empty decks are drafts — don't scream "5 issues" at a blank slate.
  // Once the user adds anything, switch to the amber violations badge.
  if (totalCards === 0) {
    return (
      <span className="bg-muted text-muted-foreground flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium">
        Constructed · Draft
      </span>
    );
  }

  return <ViolationBadge violations={violations} />;
}
