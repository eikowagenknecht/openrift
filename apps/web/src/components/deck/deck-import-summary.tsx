import type { DeckFormat, DeckFormatConfig, Marketplace } from "@openrift/shared";
import { validateDeck } from "@openrift/shared";
import { TagIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { DeckDomainBar } from "@/components/deck/deck-domain-bar";
import { DeckFormatBadge } from "@/components/deck/deck-format-badge";
import { DeckMissingCardsDialog } from "@/components/deck/deck-missing-cards-dialog";
import { DeckOwnershipBridge } from "@/components/deck/deck-ownership-bridge";
import { DeckOwnershipBody } from "@/components/deck/deck-ownership-panel";
import { Button } from "@/components/ui/button";
import { useCards } from "@/hooks/use-cards";
import { useCustomTagAssignments } from "@/hooks/use-custom-tag-assignments";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckStats } from "@/hooks/use-deck-stats";
import { useChampionIdentifierTags } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toDeckBuilderCard, toRuleEngineCard } from "@/lib/deck-builder-card";
import type { ImportedDeckCard } from "@/lib/deck-import-cards";
import { requiredZoneProgress } from "@/lib/deck-zone-labels";
import { formatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";

/**
 * Resolves the import's deck-card rows against the catalog. Rows whose card is
 * missing from the catalog are dropped — the import matcher only ever resolves
 * to catalog cards, so this is the type narrowing rather than a real case.
 * @returns The builder cards backing the summary's stats.
 */
export function toBuilderCards(
  cards: ImportedDeckCard[],
  cardsById: ReturnType<typeof useCards>["cardsById"],
): DeckBuilderCard[] {
  const builderCards: DeckBuilderCard[] = [];
  for (const card of cards) {
    const builderCard = toDeckBuilderCard(card, cardsById);
    if (builderCard) {
      builderCards.push(builderCard);
    }
  }
  return builderCards;
}

/**
 * What the deck being imported adds up to, shown above the entry list: its
 * domain split, its size, whether it is legal in the chosen format, and — for
 * a signed-in importer — how much of it their collection already covers and
 * what the rest costs. Everything is derived from the entries that would
 * actually be imported, so skipping or resolving a row moves these figures.
 *
 * The numbers come from the same hooks the deck page uses (`useDeckStats`,
 * `useDeckOwnership`, `validateDeck`), so the preview and the deck it creates
 * can never disagree.
 *
 * @returns The summary panel, or null when nothing is importable yet.
 */
export function DeckImportSummary({
  cards,
  format,
  formatConfig,
  deckName,
  isLoggedIn,
}: {
  /** The deduped rows that would be imported — skipped and unresolved entries already removed. */
  cards: ImportedDeckCard[];
  format: DeckFormat;
  /** The target deck's format config in replace mode; null for a new deck. */
  formatConfig: DeckFormatConfig | null;
  /** Names the deck in the missing-cards dialog's buy list. */
  deckName: string;
  /** Logged out there is no collection to measure against, so only prices are shown. */
  isLoggedIn: boolean;
}) {
  const { cardsById } = useCards();
  const championIdentifierTags = useChampionIdentifierTags();
  const customTagAssignments = useCustomTagAssignments();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace: Marketplace = marketplaceOrder[0] ?? "cardtrader";
  const hydrated = useHydrated();
  const [ownershipData, setOwnershipData] = useState<DeckOwnershipData>();
  const [missingOpen, setMissingOpen] = useState(false);

  const builderCards = toBuilderCards(cards, cardsById);
  const stats = useDeckStats(builderCards);
  const violations = validateDeck({
    format,
    formatConfig,
    cards: builderCards.map((card) => toRuleEngineCard(card, customTagAssignments)),
    championIdentifierTags,
  });
  const totalCards = builderCards.reduce((sum, card) => sum + card.quantity, 0);
  const { progress: requiredProgress, total: requiredTotal } = requiredZoneProgress(
    builderCards,
    format,
  );

  if (builderCards.length === 0) {
    return null;
  }

  return (
    <>
      <div className="bg-muted/50 space-y-3 rounded-md border p-4">
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {totalCards} {totalCards === 1 ? "card" : "cards"}
          </span>
          <div className="min-w-0 flex-1">
            <DeckDomainBar distribution={stats.domainDistribution} />
          </div>
          <DeckFormatBadge
            format={format}
            totalCards={totalCards}
            requiredProgress={requiredProgress}
            requiredTotal={requiredTotal}
            isValid={violations.length === 0}
            violations={violations}
          />
        </div>

        {/* Logged out there is no collection to compare against, so every
            owned/missing figure would read zero. What the deck costs still
            says something. The note deliberately isn't a sign-in link:
            leaving now would drop the parsed list, and an import finished
            here is claimed on the next sign-in anyway (ADR-035). */}
        {isLoggedIn ? (
          ownershipData && (
            <DeckOwnershipBody
              data={ownershipData}
              marketplace={marketplace}
              onViewMissing={() => setMissingOpen(true)}
            />
          )
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Sign in after importing to see which of these you already own.
            </p>
            {ownershipData?.deckValueCents !== undefined && (
              <Button
                variant="outline"
                size="sm"
                className="w-full tabular-nums"
                onClick={() => setMissingOpen(true)}
              >
                <TagIcon className="size-3.5" />
                {formatterForMarketplace(marketplace)(ownershipData.deckValueCents)}
                <span className="text-muted-foreground">· view prices</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Ownership and prices need the viewer's copies plus the price table,
          both client-only. Gate behind hydration and suspend for the fetches. */}
      {hydrated && (
        <Suspense fallback={null}>
          <DeckOwnershipBridge
            builderCards={builderCards}
            isLoggedIn={isLoggedIn}
            marketplace={marketplace}
            onResult={setOwnershipData}
          />
        </Suspense>
      )}

      {ownershipData && (
        <DeckMissingCardsDialog
          open={missingOpen}
          onOpenChange={setMissingOpen}
          missingCards={ownershipData.missingCards}
          totalMissingValue={ownershipData.missingValueCents}
          marketplace={marketplace}
          mode={isLoggedIn ? "missing" : "prices"}
          deckName={deckName}
        />
      )}
    </>
  );
}
