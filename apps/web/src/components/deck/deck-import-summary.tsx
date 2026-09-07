import { validateDeck } from "@openrift/shared/deck-rules";
import type { DeckFormatConfig } from "@openrift/shared/types/api/deck";
import type { DeckFormat } from "@openrift/shared/types/enums";
import type { Marketplace } from "@openrift/shared/types/pricing";
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
import { useDeckStats } from "@/hooks/use-deck-stats";
import { useChampionIdentifierTags } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toDeckBuilderCard, toRuleEngineCard } from "@/lib/deck-builder-card";
import type { ImportedDeckCard } from "@/lib/deck-import-cards";
import type { DeckOwnershipData } from "@/lib/deck-ownership-types";
import { requiredZoneProgress } from "@/lib/deck-zone-labels";
import { formatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";

/** Drops rows whose card is missing from the catalog: type narrowing, not a real case. */
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
 * Uses the same hooks the deck page uses (useDeckStats, useDeckOwnership,
 * validateDeck), so the preview and the deck it creates can never disagree.
 */
export function DeckImportSummary({
  cards,
  format,
  formatConfig,
  deckName,
  isLoggedIn,
}: {
  cards: ImportedDeckCard[];
  format: DeckFormat;
  /** null for a new deck. */
  formatConfig: DeckFormatConfig | null;
  deckName: string;
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

        {/* Not a sign-in link: leaving now would drop the parsed list. An
            import finished here is claimed on the next sign-in anyway. */}
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

      {/* Client-only: gate behind hydration and suspend for the fetches. */}
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
