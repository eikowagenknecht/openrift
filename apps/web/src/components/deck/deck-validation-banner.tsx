import type { DeckViolation } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { CheckIcon, CircleAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDeckCards, useDeckViolations } from "@/hooks/use-deck-builder";
import { useDeckDetail } from "@/hooks/use-decks";
import { useCustomTagList, useDeckFormatList } from "@/hooks/use-enums";

/**
 * Badge showing a click-to-open popover listing each violation.
 * @returns The violation badge element.
 */
function ViolationBadge({
  formatLabel,
  violations,
}: {
  formatLabel: string;
  violations: DeckViolation[];
}) {
  return (
    <Popover>
      <PopoverTrigger nativeButton={false} render={<span />}>
        <Badge
          variant="warning"
          className="shrink-0 cursor-pointer rounded-md dark:bg-amber-500/10"
        >
          {formatLabel}
          <CircleAlertIcon className="size-3" />
        </Badge>
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
 * Format badge showing "<Format> ✓", "<Format> · Draft", or violation count.
 * @returns The format badge element.
 */
export function DeckFormatBadge({ deckId }: { deckId: string }) {
  const { data: deckDetail } = useDeckDetail(deckId);
  const format = deckDetail.deck.format;
  const formatConfig = deckDetail.deck.formatConfig;
  const { labels } = useDeckFormatList();
  const { all: customTags } = useCustomTagList();
  // For Custom-Region decks, append "· <Region> + <Region>" to the label so
  // the deck's active tags are visible at a glance. Slugs that no longer
  // resolve (admin-deleted) are silently dropped from the display rather
  // than rendered as the raw slug — the validation banner is the right
  // place to surface that breakage, not the format badge.
  const tagSlugs = formatConfig?.tagSlugs ?? [];
  const tagLabels = tagSlugs
    .map((slug) => customTags.find((t) => t.slug === slug)?.label)
    .filter((label): label is string => typeof label === "string");
  const baseLabel = labels[format] ?? format;
  const formatLabel = tagLabels.length > 0 ? `${baseLabel} · ${tagLabels.join(" + ")}` : baseLabel;
  const violations = useDeckViolations(deckId, format, formatConfig);
  const cards = useDeckCards(deckId);
  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);

  const isValid = format === WellKnown.deckFormat.FREEFORM || violations.length === 0;

  if (isValid) {
    return (
      <Badge variant="success" className="rounded-md dark:bg-green-500/10">
        {formatLabel}
        <CheckIcon className="size-3" />
      </Badge>
    );
  }

  // Empty decks are drafts — don't scream "5 issues" at a blank slate.
  // Once the user adds anything, switch to the amber violations badge.
  if (totalCards === 0) {
    return (
      <Badge variant="muted" className="rounded-md">
        {formatLabel} · Draft
      </Badge>
    );
  }

  return <ViolationBadge formatLabel={formatLabel} violations={violations} />;
}
