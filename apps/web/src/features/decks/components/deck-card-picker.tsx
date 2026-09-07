import { enumLabel } from "@openrift/shared/enum-label";
import { legendDisplayName } from "@openrift/shared/utils";
import { XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { CardSearchDropdown } from "@/features/cards/components/card-search-dropdown";
import { CardThumbnail } from "@/features/cards/components/printing-option-content";
import { useCardSearch } from "@/features/cards/hooks/use-card-search";
import { usePreferredPrinting } from "@/features/cards/hooks/use-preferred-printing";
import type { HoverHandler } from "@/features/cards/lib/card-row-interactions";
import type { CardSearchResult } from "@/features/cards/lib/card-search-result";
import { EnergyGlyph, PowerPips } from "@/features/decks/components/deck-card-row";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { cn } from "@/lib/utils";

interface CardCandidate {
  cardId: string;
  cardName: string;
  altNames?: string[];
}

/**
 * Rendered as its own component so the chip and the picker's dropdown rows
 * show the same power pips and energy glyph without either owning the lookup.
 */
function CardStats({ cardId }: { cardId: string }) {
  const { getPreferredPrinting } = usePreferredPrinting();
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  const card = getPreferredPrinting(cardId)?.card;
  const powerPips = card?.power ?? 0;
  const energy = card?.energy ?? null;
  if (powerPips <= 0 && energy === null) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <PowerPips
        power={powerPips}
        domains={card?.domains ?? []}
        colors={domainColors}
        domainLabels={labels.domains}
      />
      {energy !== null && <EnergyGlyph value={energy} />}
    </span>
  );
}

const MAX_PICKER_RESULTS = 50;

const PICKER_MIN_QUERY_LENGTH = 1;

// An empty query lists the whole candidate set for a zone-backed dropdown;
// a catalog-backed caller turns listAllWhenEmpty off instead.
function usePickerResults(
  candidates: CardCandidate[],
  query: string,
  listAllWhenEmpty: boolean,
): CardSearchResult[] {
  const { getPreferredPrinting } = usePreferredPrinting();
  const { labels } = useEnumOrders();
  const searchable = useMemo(
    () =>
      candidates.map((card) => ({
        id: card.cardId,
        // The matcher only reads `slug` for exact-slug lookups; the id keeps
        // every entry distinct.
        slug: card.cardId,
        name: card.cardName,
        altNames: card.altNames,
      })),
    [candidates],
  );

  const matches = useCardSearch(
    searchable,
    query.trim(),
    undefined,
    MAX_PICKER_RESULTS,
    PICKER_MIN_QUERY_LENGTH,
  );
  const emptyList = listAllWhenEmpty ? searchable.slice(0, MAX_PICKER_RESULTS) : [];
  const shown = query.trim() === "" ? emptyList : matches;

  return shown.map((card) => {
    const printing = getPreferredPrinting(card.id);
    const detail = printing?.card.types.map((slug) => enumLabel(labels.cardTypes, slug)).join(" ");
    return {
      id: card.id,
      label: card.name,
      detail,
      leading: <CardThumbnail cardId={card.id} className="h-8" />,
      adornment: <CardStats cardId={card.id} />,
    };
  });
}

export function CardChip({
  cardId,
  onRemove,
  onHoverCard,
  variant = "pill",
}: {
  cardId: string;
  onRemove?: () => void;
  onHoverCard?: HoverHandler;
  variant?: "pill" | "field";
}) {
  const { getPreferredPrinting } = usePreferredPrinting();
  const printing = getPreferredPrinting(cardId);
  const field = variant === "field";
  return (
    <span
      className={cn(
        "min-w-0 items-center text-sm",
        field
          ? "dark:bg-input/30 border-input flex h-8 w-full gap-2 rounded-lg border bg-transparent px-2.5"
          : "bg-muted inline-flex gap-1.5 rounded-md py-0.5 pr-1 pl-1.5",
      )}
      onMouseEnter={() => onHoverCard?.(cardId)}
      onMouseLeave={() => onHoverCard?.(null)}
    >
      <CardThumbnail cardId={cardId} className="h-5" />
      <span className="min-w-0 truncate">
        {printing ? legendDisplayName(printing.card) : "Unknown card"}
      </span>
      <CardStats cardId={cardId} />
      {onRemove ? (
        <ChipRemoveButton
          onClick={onRemove}
          aria-label="Remove"
          className={cn("text-muted-foreground shrink-0 p-0.5", field ? "ml-auto" : "ml-0")}
        >
          <XIcon className="size-3.5" />
        </ChipRemoveButton>
      ) : null}
    </span>
  );
}

// Remounts the dropdown after each pick; otherwise its input keeps the chosen label.
export function CardPicker({
  candidates,
  onSelect,
  placeholder,
  listAllWhenEmpty = true,
}: {
  candidates: CardCandidate[];
  onSelect: (cardId: string) => void;
  placeholder: string;
  listAllWhenEmpty?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const results = usePickerResults(candidates, query, listAllWhenEmpty);
  // The combobox fires onInputValueChange with the picked label on selection,
  // which would leave `query` stuck on it; clearing on the resetKey bump wins.
  const [clearedFor, setClearedFor] = useState(resetKey);
  if (clearedFor !== resetKey) {
    setClearedFor(resetKey);
    setQuery("");
  }
  return (
    <CardSearchDropdown
      key={resetKey}
      results={results}
      onSearch={setQuery}
      onSelect={(cardId) => {
        onSelect(cardId);
        setResetKey((key) => key + 1);
      }}
      placeholder={placeholder}
      className="h-8"
    />
  );
}
