import { legendDisplayName } from "@openrift/shared";
import { XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { CardSearchResult } from "@/components/cards/card-search-dropdown";
import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import { CardThumbnail } from "@/components/cards/printing-option-content";
import { EnergyGlyph, PowerPips } from "@/components/deck/deck-card-row";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { useCardSearch } from "@/hooks/use-card-search";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { cn } from "@/lib/utils";

/** Shows a card in the page's floating preview; null clears it. */
export type HoverHandler = (cardId: string | null, preferredPrintingId?: string | null) => void;

/** One selectable card in a {@link CardPicker}. */
interface CardCandidate {
  cardId: string;
  cardName: string;
  /**
   * Other spellings this candidate answers to, from `cardSearchAltNames`. The
   * catalog-wide opponent picker supplies them; a picker over one deck zone
   * lists cards by the name the deck already stores, so it passes none.
   */
  altNames?: string[];
}

/**
 * The deck list's power pips and energy glyph for one card, resolved from the
 * catalog. Rendered as its own component so the chip and the picker's dropdown
 * rows show the same thing without either owning the lookup.
 * @returns The stats, or null when the card has neither.
 */
function CardStats({ cardId }: { cardId: string }) {
  const { getPreferredPrinting } = usePreferredPrinting();
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  const card = getPreferredPrinting(cardId)?.card;
  // Mirrors the deck list row: pips only for real power, energy whenever the
  // card has any, power first.
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

/** Cap so a long deck zone can't flood the dropdown. */
const MAX_PICKER_RESULTS = 50;

/** One letter is a useful filter over a single zone, unlike over the catalog. */
const PICKER_MIN_QUERY_LENGTH = 1;

/**
 * Narrows a candidate list to a search query through the app-wide ranked
 * matcher, so this picker folds punctuation the same way every other one does.
 * An empty query lists the whole candidate set, which is what makes a
 * zone-backed dropdown usable before the user types anything; a catalog-backed
 * caller turns that off, since the first 50 cards in collector order help
 * nobody.
 *
 * Every row comes out the same shape — thumbnail, name, stats, card type — with
 * the type and the stats resolved here from the catalog rather than handed in
 * per call site.
 *
 * @returns The matching candidates as dropdown results.
 */
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
        // The matcher only reads `slug` for exact-slug lookups, which this
        // picker never does; the id keeps every entry distinct.
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
    // A picker over one card type (the battlefield slots) repeats the same
    // word down every row. That's the accepted cost of one row shape: a knob
    // to hide it is what let the three pickers drift apart to begin with.
    const printing = getPreferredPrinting(card.id);
    const detail = printing?.card.types.map((slug) => labels.cardTypes[slug]).join(" ");
    return {
      id: card.id,
      label: card.name,
      detail,
      // Taller than the chip's: the row is where the card gets recognized, and
      // a name alone is thin evidence across near-identical battlefields.
      leading: <CardThumbnail cardId={card.id} className="h-8" />,
      adornment: <CardStats cardId={card.id} />,
    };
  });
}

/**
 * A compact thumbnail + name chip for a picked card, carrying the same power
 * pips and energy glyph as the picker rows it replaces. Hovering shows the full
 * card via the page's floating preview (the opponent card isn't in the deck, so
 * the name/image come from the catalog).
 * @returns The chip.
 */
export function CardChip({
  cardId,
  onRemove,
  onHoverCard,
  variant = "pill",
}: {
  cardId: string;
  onRemove?: () => void;
  onHoverCard?: HoverHandler;
  /** "pill" is a compact inline chip; "field" fills the row like an input box. */
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
          : "bg-muted/60 inline-flex gap-1.5 rounded-md py-0.5 pr-1 pl-1.5",
      )}
      onMouseEnter={() => onHoverCard?.(cardId)}
      onMouseLeave={() => onHoverCard?.(null)}
    >
      {/* One box for both orientations: it used to flip between h-5 w-8 and
          h-7 w-5, so a list mixing battlefields with ordinary cards jumped
          height row to row. */}
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

/**
 * Searchable picker over a fixed candidate set (deck zone cards or the
 * catalog). Remounts the dropdown after each pick so its input clears instead
 * of keeping the chosen label.
 * @returns The picker.
 */
export function CardPicker({
  candidates,
  onSelect,
  placeholder,
  listAllWhenEmpty = true,
}: {
  candidates: CardCandidate[];
  onSelect: (cardId: string) => void;
  placeholder: string;
  /**
   * Whether an empty query lists the candidates. On for a bounded set the user
   * owns (a deck zone, where browsing is the point); off for a catalog-wide
   * picker, which shows nothing until a character is typed, like every other
   * catalog search.
   */
  listAllWhenEmpty?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const results = usePickerResults(candidates, query, listAllWhenEmpty);
  // The combobox fires onInputValueChange with the picked label as it fills the
  // input on selection, which would leave `query` stuck on that card and filter
  // the next open down to just it. Clearing here, after the remount, wins over
  // that late update.
  useEffect(() => {
    setQuery("");
  }, [resetKey]);
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
