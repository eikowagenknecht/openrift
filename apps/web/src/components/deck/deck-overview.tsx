import type { DeckZone, Marketplace } from "@openrift/shared";
import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";

import { DeckOwnershipPanel } from "@/components/deck/deck-ownership-panel";
import { DeckStatsPanel } from "@/components/deck/deck-stats-panel";
import { useDeckCards, useDeckViolations } from "@/hooks/use-deck-builder";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckDetail } from "@/hooks/use-decks";
import { useZoneOrder } from "@/hooks/use-enums";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { cn } from "@/lib/utils";

const ZONE_EXPECTED: Partial<Record<DeckZone, number>> = {
  legend: 1,
  champion: 1,
  runes: 12,
  battlefield: 3,
  main: 39,
};

const ZONE_EMPTY_HINTS: Record<DeckZone, string> = {
  legend: "Choose a Legend to get started",
  champion: "Pick a Champion that matches your Legend",
  runes: "Auto-fills when you set a Legend",
  battlefield: "Choose 3 unique Battlefield cards",
  main: "Add cards from the browser",
  sideboard: "Add up to 8 sideboard cards",
  overflow: "Stash extra cards here while you decide",
};

const LANDSCAPE_ZONES: ReadonlySet<DeckZone> = new Set(["battlefield"]);

const MAX_PREVIEW_THUMBS = 5;

interface DeckOverviewProps {
  deckId: string;
  ownershipData?: DeckOwnershipData;
  marketplace: Marketplace;
  onZoneClick: (zone: DeckZone) => void;
  onViewMissing: () => void;
  onHoverCard?: (cardId: string | null) => void;
}

/**
 * Full-width summary shown in the main content area when no deck zone is active.
 * Acts as both a deck dashboard and zone picker — clicking a zone tile drops
 * the user into that zone's card browser.
 * @returns The deck overview view.
 */
export function DeckOverview({
  deckId,
  ownershipData,
  marketplace,
  onZoneClick,
  onViewMissing,
  onHoverCard,
}: DeckOverviewProps) {
  const { data: deckDetail } = useDeckDetail(deckId);
  const cards = useDeckCards(deckId);
  const violations = useDeckViolations(deckId, deckDetail.deck.format);
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const { getPreferredFrontImage } = usePreferredPrinting();

  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
  const hasLegend = cards.some((card) => card.zone === "legend");
  const hint =
    totalCards === 0
      ? "Start by picking a Legend — then Champions, Runes, and the main deck unlock around it."
      : hasLegend
        ? null
        : "Pick a Legend to unlock matching Champions and auto-fill Runes.";

  return (
    <div className="flex flex-col gap-6 px-1 pt-2 pb-4">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold">{deckDetail.deck.name}</h2>
        <p className="text-muted-foreground text-sm">
          {totalCards} {totalCards === 1 ? "card" : "cards"}
          {" · "}
          {deckDetail.deck.format === "constructed" ? "Constructed" : "Freeform"}
        </p>
        {hint && <p className="text-sm">{hint}</p>}
      </header>

      <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
        {zoneOrder.map((zone) => (
          <ZoneTile
            key={zone}
            zone={zone}
            label={zoneLabels[zone]}
            cards={cards.filter((card) => card.zone === zone)}
            expected={ZONE_EXPECTED[zone]}
            emptyHint={ZONE_EMPTY_HINTS[zone]}
            hasViolation={violations.some(
              (violation) => violation.zone === zone && !violation.cardId,
            )}
            onClick={() => onZoneClick(zone)}
            onHoverCard={onHoverCard}
            getThumbnail={(cardId) => getPreferredFrontImage(cardId)?.thumbnail}
          />
        ))}
      </div>

      {totalCards > 0 && <DeckStatsPanel deckId={deckId} />}
      {ownershipData && (
        <DeckOwnershipPanel
          data={ownershipData}
          marketplace={marketplace}
          onViewMissing={onViewMissing}
        />
      )}
    </div>
  );
}

interface ZoneTileProps {
  zone: DeckZone;
  label: string;
  cards: DeckBuilderCard[];
  expected: number | undefined;
  emptyHint: string;
  hasViolation: boolean;
  onClick: () => void;
  onHoverCard?: (cardId: string | null) => void;
  getThumbnail: (cardId: string) => string | undefined;
}

function ZoneTile({
  zone,
  label,
  cards,
  expected,
  emptyHint,
  hasViolation,
  onClick,
  onHoverCard,
  getThumbnail,
}: ZoneTileProps) {
  const quantity = cards.reduce((sum, card) => sum + card.quantity, 0);
  const isEmpty = cards.length === 0;
  const isComplete = !hasViolation && expected !== undefined && quantity === expected;
  const isLandscape = LANDSCAPE_ZONES.has(zone);

  const sortedCards = cards.toSorted((a, b) => {
    if (b.quantity !== a.quantity) {
      return b.quantity - a.quantity;
    }
    return a.cardName.localeCompare(b.cardName);
  });
  const previewCards = sortedCards.slice(0, MAX_PREVIEW_THUMBS);
  const remaining = sortedCards.length - previewCards.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group bg-card flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
        "hover:border-primary/50 hover:bg-muted/40",
        hasViolation && "border-destructive/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        {isComplete && <CheckCircle2Icon className="size-3.5 text-green-600 dark:text-green-500" />}
        {hasViolation && <AlertTriangleIcon className="text-destructive size-3.5" />}
        <span
          className={cn(
            "ml-auto text-xs tabular-nums",
            hasViolation ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {quantity}
          {expected !== undefined && `/${expected}`}
        </span>
      </div>

      {isEmpty ? (
        <p className="text-muted-foreground text-xs">{emptyHint}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {previewCards.map((card) => {
            const thumbnail = getThumbnail(card.cardId);
            if (!thumbnail) {
              return null;
            }
            return (
              <div
                key={card.cardId}
                className="relative shrink-0"
                onMouseEnter={() => onHoverCard?.(card.cardId)}
                onMouseLeave={() => onHoverCard?.(null)}
              >
                <img
                  src={thumbnail}
                  alt={card.cardName}
                  className={cn(
                    "rounded-sm object-cover shadow-sm",
                    isLandscape ? "h-10 w-14" : "h-14 w-10",
                  )}
                />
                {card.quantity > 1 && (
                  <span className="bg-background/90 text-foreground absolute right-0.5 bottom-0.5 rounded px-1 text-[10px] leading-tight font-medium tabular-nums">
                    ×{card.quantity}
                  </span>
                )}
              </div>
            );
          })}
          {remaining > 0 && <span className="text-muted-foreground text-xs">+{remaining}</span>}
        </div>
      )}
    </button>
  );
}
