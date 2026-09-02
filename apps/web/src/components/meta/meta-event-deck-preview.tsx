import type { Marketplace, MetaDeckDetailResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CheckIcon, GitForkIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { DeckOwnershipBridge } from "@/components/deck/deck-ownership-bridge";
import { DomainIcon } from "@/components/deck/domain-icon";
import { MetaContributors } from "@/components/meta/meta-contributors";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useForkArchivedDeck } from "@/hooks/use-fork-archived-deck";
import { useHydrated } from "@/hooks/use-hydrated";
import { useMetaDeck } from "@/hooks/use-meta";
import { toBuilderCardFromPublic } from "@/lib/deck-builder-card";
import { formatterForMarketplace } from "@/lib/format";
import { MARKETPLACE_META } from "@/lib/marketplace-meta";
import { archivedDeckIdentity } from "@/lib/meta-deck-archive";
import type { DeckRuneSplit, DeckTypeSplit } from "@/lib/meta-deck-composition";
import { deckRuneSplit, deckTypeSplit } from "@/lib/meta-deck-composition";
import { useDisplayStore } from "@/stores/display-store";

const EYEBROW = "text-muted-foreground text-2xs tracking-wider uppercase";

/** Suspends on the deck query; mount it under a Suspense boundary with {@link MetaEventDeckPreviewSkeleton}. */
export function MetaEventDeckPreview({ token }: { token: string }) {
  const { data } = useMetaDeck(token);
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "cardtrader";
  const hydrated = useHydrated();
  const [ownership, setOwnership] = useState<DeckOwnershipData>();

  const builderCards = data.cards.map(toBuilderCardFromPublic);
  const fork = useForkArchivedDeck();

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <PreviewIdentity data={data} />
      <PreviewComposition types={deckTypeSplit(data.cards)} runes={deckRuneSplit(data.cards)} />
      <div className="flex flex-col gap-3">
        <PreviewValue
          ownership={ownership}
          marketplace={marketplace}
          isLoggedIn={fork.isLoggedIn}
          eventSlug={data.meta.event.slug}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={fork.isPending}
            onClick={() => fork.fork({ token, deck: data.deck, cards: data.cards })}
          >
            <GitForkIcon />
            {fork.isPending ? "Copying…" : fork.label}
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/meta/decks/$token" params={{ token }} />}
          >
            Open deck
          </Button>
        </div>
      </div>

      {/* Prices and the viewer's own copies both need the catalog and a live
          query, so the figures arrive after hydration and the box shows
          skeletons until then. */}
      {hydrated && (
        <Suspense fallback={null}>
          <DeckOwnershipBridge
            builderCards={builderCards}
            isLoggedIn={fork.isLoggedIn}
            marketplace={marketplace}
            onResult={setOwnership}
          />
        </Suspense>
      )}
    </div>
  );
}

export function MetaEventDeckPreviewSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="flex gap-3">
        <Skeleton className="aspect-card w-14 self-start" />
        <div className="flex-1 space-y-2 py-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="space-y-2 py-1">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      <div className="space-y-2 py-1">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-8 w-40" />
      </div>
    </div>
  );
}

function PreviewIdentity({ data }: { data: MetaDeckDetailResponse }) {
  const identity = archivedDeckIdentity(data.cards);
  const legend = data.cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
  const champion = data.cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION);
  // The identity falls back to the champion for a list with no Legend, and
  // naming the same card twice reads as a mistake.
  const championName = legend ? champion?.cardName : undefined;

  return (
    <div className="flex min-w-0 gap-3">
      <CardArtThumb
        imageId={legend?.imageId ?? champion?.imageId ?? null}
        domains={identity?.domains}
        loading="lazy"
        className="w-14 self-start"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading font-semibold">{data.deck.name}</span>
          <MetaListStatusBadge listStatus={data.meta.listStatus} />
        </div>
        <p className="text-muted-foreground truncate text-sm">{data.meta.playerName}</p>
        {championName !== undefined && (
          <p className="text-muted-foreground truncate text-sm">Champion · {championName}</p>
        )}
        <MetaContributors contributors={data.meta.contributors} />
      </div>
    </div>
  );
}

function PreviewComposition({ types, runes }: { types: DeckTypeSplit; runes: DeckRuneSplit[] }) {
  return (
    <div className="flex flex-col gap-3">
      {types.total > 0 && (
        <div className="space-y-1.5">
          <p className={EYEBROW}>Card types</p>
          <div className="flex h-2 overflow-hidden rounded-full">
            <TypeSegment count={types.units} className="bg-primary" />
            <TypeSegment count={types.spells} className="bg-border-accent" />
            <TypeSegment count={types.gear} className="bg-muted-foreground/50" />
          </div>
          <p className="text-xs tabular-nums">
            {types.units} units · {types.spells} spells · {types.gear} gear
          </p>
        </div>
      )}
      {runes.length > 0 && (
        <div className="space-y-1.5">
          <p className={EYEBROW}>Runes</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {runes.map((rune) => (
              <span key={rune.domain} className="flex items-center gap-1">
                <DomainIcon domain={rune.domain} className="size-4" />
                <span className="text-xs tabular-nums">{rune.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TypeSegment({ count, className }: { count: number; className: string }) {
  if (count === 0) {
    return null;
  }
  return <span className={className} style={{ flexGrow: count }} />;
}

function PreviewValue({
  ownership,
  marketplace,
  isLoggedIn,
  eventSlug,
}: {
  ownership: DeckOwnershipData | undefined;
  marketplace: Marketplace;
  isLoggedIn: boolean;
  eventSlug: string;
}) {
  const format = formatterForMarketplace(marketplace);
  return (
    <div className="bg-muted/40 ring-foreground/10 rounded-lg p-3 ring-1">
      <p className={EYEBROW}>Deck value · {MARKETPLACE_META[marketplace].label}</p>
      {ownership === undefined ? (
        <div className="mt-1 space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-40" />
        </div>
      ) : ownership.deckValueCents === undefined ? (
        <p className="text-muted-foreground mt-1 text-sm">No prices yet</p>
      ) : (
        <>
          <p className="font-heading text-2xl font-bold tabular-nums">
            {format(ownership.deckValueCents)}
          </p>
          {ownership.mainValueCents !== undefined && (
            <p className="text-muted-foreground text-xs tabular-nums">
              Main deck {format(ownership.mainValueCents)}
              {ownership.sideboardValueCents !== undefined &&
                ownership.sideboardValueCents > 0 &&
                ` · Sideboard ${format(ownership.sideboardValueCents)}`}
            </p>
          )}
        </>
      )}
      <div className="border-foreground/10 my-2 border-t" />
      {isLoggedIn ? (
        <OwnedLine ownership={ownership} />
      ) : (
        <Link
          to="/login"
          search={{ redirect: `/meta/${eventSlug}`, email: undefined }}
          className="text-primary text-xs hover:underline"
        >
          Sign in to compare with your collection
        </Link>
      )}
    </div>
  );
}

function OwnedLine({ ownership }: { ownership: DeckOwnershipData | undefined }) {
  if (!ownership) {
    return <Skeleton className="h-3 w-40" />;
  }
  if (ownership.missingCount === 0) {
    return (
      <p className="flex items-center gap-1 text-xs text-green-600 tabular-nums dark:text-green-500">
        <CheckIcon className="size-3.5" />
        All {ownership.totalNeeded} cards owned
      </p>
    );
  }
  return (
    <p className="text-xs tabular-nums">
      {ownership.totalOwned} of {ownership.totalNeeded} cards owned
    </p>
  );
}
