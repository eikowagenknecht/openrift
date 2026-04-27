import type { PublicDeckCardResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { CopyIcon } from "lucide-react";
import { Suspense, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DeckMissingCardsDialog } from "@/components/deck/deck-missing-cards-dialog";
import { DeckOverview } from "@/components/deck/deck-overview";
import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import { SharedDeckOwnershipBridge } from "@/components/deck/shared-deck-ownership-bridge";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarHeightContext,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useCloneSharedDeck, usePublicDeck } from "@/hooks/use-decks";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

const FORMAT_LABELS: Record<"constructed" | "freeform", string> = {
  constructed: "Constructed",
  freeform: "Freeform",
};

export const Route = createLazyFileRoute("/_app/decks_/share/$token")({
  component: SharedDeckPage,
});

function SharedDeckPage() {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);

  return (
    <PageTopBarHeightContext value={topBarHeight}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY} />
        <SharedDeckContent topBarSlot={topBarSlot} />
      </div>
    </PageTopBarHeightContext>
  );
}

function toBuilderCardFromPublic(card: PublicDeckCardResponse): DeckBuilderCard {
  return {
    cardId: card.cardId,
    zone: card.zone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
    cardName: card.cardName,
    cardType: card.cardType,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags,
    keywords: card.keywords,
    energy: card.energy,
    might: card.might,
    power: card.power,
  };
}

function thumbKey(cardId: string, preferredPrintingId: string | null): string {
  return `${cardId}|${preferredPrintingId ?? ""}`;
}

function SharedDeckContent({ topBarSlot }: { topBarSlot: HTMLDivElement | null }) {
  const { token } = Route.useParams();
  const { data } = usePublicDeck(token);
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const deckSharingEnabled = useFeatureEnabled("deck-sharing");
  const cloneMutation = useCloneSharedDeck();
  const navigate = useNavigate();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "cardtrader";
  const isMobile = useIsMobile();
  const isHydrated = useIsHydrated();

  // Everything the shell needs — builder cards, thumbnails, hover full-image
  // URLs, and card slugs — comes straight from the enriched payload. No
  // catalog lookup, so this branch is SSR-safe.
  const builderCards = useMemo(() => data.cards.map(toBuilderCardFromPublic), [data.cards]);
  const slugByCardId = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of data.cards) {
      map.set(card.cardId, card.cardSlug);
    }
    return map;
  }, [data.cards]);
  const thumbByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of data.cards) {
      if (card.thumbnailUrl) {
        map.set(thumbKey(card.cardId, card.preferredPrintingId), card.thumbnailUrl);
      }
    }
    return map;
  }, [data.cards]);
  const hoverMeta = useMemo(() => {
    const map = new Map<string, { fullUrl: string; landscape: boolean }>();
    for (const card of data.cards) {
      if (card.fullImageUrl) {
        map.set(thumbKey(card.cardId, card.preferredPrintingId), {
          fullUrl: card.fullImageUrl,
          landscape: card.cardType === WellKnown.cardType.BATTLEFIELD,
        });
      }
    }
    return map;
  }, [data.cards]);

  const [ownershipData, setOwnershipData] = useState<DeckOwnershipData>();

  const [hovered, setHovered] = useState<{
    id: string;
    preferredPrintingId: string | null;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [missingOpen, setMissingOpen] = useState(false);

  const onHoverCard = (id: string | null, preferredPrintingId?: string | null) =>
    setHovered(id ? { id, preferredPrintingId: preferredPrintingId ?? null } : null);

  const hoveredCard = (() => {
    if (!hovered || isMobile) {
      return null;
    }
    const meta = hoverMeta.get(thumbKey(hovered.id, hovered.preferredPrintingId));
    if (!meta) {
      return null;
    }
    return {
      thumbnailUrl: meta.fullUrl,
      fullUrl: meta.fullUrl,
      landscape: meta.landscape,
    };
  })();

  const handleClone = async () => {
    if (!isLoggedIn) {
      void navigate({
        to: "/login",
        search: { redirect: `/decks/share/${token}`, email: undefined },
      });
      return;
    }
    const result = await cloneMutation.mutateAsync(token);
    void navigate({ to: "/decks/$deckId", params: { deckId: result.deckId } });
  };

  return (
    <div
      ref={containerRef}
      className={`${PAGE_PADDING} ${CONTAINER_WIDTH} relative flex flex-col gap-4 py-4`}
    >
      {topBarSlot &&
        createPortal(
          <PageTopBar>
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <PageTopBarTitle>{data.deck.name}</PageTopBarTitle>
              <span className="text-muted-foreground hidden truncate text-xs md:inline">
                {FORMAT_LABELS[data.deck.format]} · Shared by {data.owner.displayName}
              </span>
            </div>
            <PageTopBarActions>
              {deckSharingEnabled && (
                <Button size="sm" onClick={handleClone} disabled={cloneMutation.isPending}>
                  <CopyIcon />
                  {isLoggedIn ? "Copy to my decks" : "Sign in to copy"}
                </Button>
              )}
            </PageTopBarActions>
          </PageTopBar>,
          topBarSlot,
        )}

      <HoveredCardPreview hoveredCard={hoveredCard} origin="main" containerRef={containerRef} />

      <DeckOverview
        deck={{ id: data.deck.id, name: data.deck.name, format: data.deck.format }}
        cards={builderCards}
        ownershipData={ownershipData}
        marketplace={marketplace}
        getThumbnail={(cardId, preferredPrintingId) =>
          thumbByKey.get(thumbKey(cardId, preferredPrintingId))
        }
        onHoverCard={onHoverCard}
        onViewMissing={() => setMissingOpen(true)}
        readOnly
        signInHref={
          isLoggedIn ? undefined : `/login?redirect=${encodeURIComponent(`/decks/share/${token}`)}`
        }
        description={data.deck.description ?? undefined}
        getCardSlug={(cardId) => slugByCardId.get(cardId)}
      />

      {ownershipData && (
        <DeckMissingCardsDialog
          open={missingOpen}
          onOpenChange={setMissingOpen}
          missingCards={ownershipData.missingCards}
          totalMissingValue={ownershipData.missingValueCents}
          marketplace={marketplace}
          mode={isLoggedIn ? "missing" : "prices"}
        />
      )}

      {/*
        Ownership + price data still needs the global catalog (printings +
        prices) and the user's copies, both of which require client-only
        hooks. Gate behind hydration so SSR never tries to evaluate them.
      */}
      {isHydrated && (
        <Suspense fallback={null}>
          <SharedDeckOwnershipBridge
            builderCards={builderCards}
            isLoggedIn={isLoggedIn}
            marketplace={marketplace}
            onResult={setOwnershipData}
          />
        </Suspense>
      )}
    </div>
  );
}
