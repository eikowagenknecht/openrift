import type { PublicDeckCardResponse } from "@openrift/shared/types/api/deck";
import type { DeckZone } from "@openrift/shared/types/enums";
import { getOrientation } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import { Link } from "@tanstack/react-router";
import { CheckIcon, CopyIcon, EllipsisVerticalIcon } from "lucide-react";
import { toast } from "sonner";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { useOpenCardDetail } from "@/components/cards/card-detail-opener";
import { DomainIcon } from "@/components/deck/domain-icon";
import { MetaContributors } from "@/components/meta/meta-contributors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pressable } from "@/components/ui/pressable";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopyArchivedDeck } from "@/hooks/use-copy-archived-deck";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useEncodeDeckCards } from "@/hooks/use-decks";
import { useMetaDeck } from "@/hooks/use-meta";
import { toEncodeDeckCards } from "@/lib/deck-encode-input";
import { describeIncompleteList, unknownZoneCounts } from "@/lib/meta-deck-archive";
import { deckRuneSplit, deckTypeSplit } from "@/lib/meta-deck-composition";
import { cn } from "@/lib/utils";

const SKELETON_THUMBS = 12;

/** Module scope so the copy handler's `try` stays branch-free (React Compiler). */
function reportEncodeWarnings(warnings: readonly string[]): void {
  if (warnings.length > 0) {
    toast.warning("The deck code left some cards out.", { description: warnings.join(" ") });
  }
}

function printingIdOf(card: PublicDeckCardResponse): string | null {
  return card.resolvedPrintingId ?? card.preferredPrintingId;
}

function byEnergyThenName(a: PublicDeckCardResponse, b: PublicDeckCardResponse): number {
  const energyA = a.energy ?? Number.MAX_SAFE_INTEGER;
  const energyB = b.energy ?? Number.MAX_SAFE_INTEGER;
  return energyA - energyB || a.cardName.localeCompare(b.cardName);
}

function zoneCards(
  cards: readonly PublicDeckCardResponse[],
  zone: DeckZone,
): PublicDeckCardResponse[] {
  return cards.filter((card) => card.zone === zone);
}

function StripCard({
  card,
  sequence,
  sideboard,
}: {
  card: PublicDeckCardResponse;
  sequence: string[];
  sideboard?: boolean;
}) {
  const openCardDetail = useOpenCardDetail();
  const printingId = printingIdOf(card);
  const label = card.quantity > 1 ? `${card.quantity}× ${card.cardName}` : card.cardName;
  const art = (
    <>
      <CardArtThumb
        imageId={card.imageId}
        domains={card.domains}
        className={sideboard ? "w-7" : "w-9"}
        loading="lazy"
        landscape={getOrientation(card.cardTypes) === "landscape"}
      />
      {card.quantity > 1 && (
        <span className="text-2xs absolute right-0 bottom-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-black/65 px-1 font-semibold text-white tabular-nums">
          {card.quantity}
        </span>
      )}
    </>
  );
  const className = cn("relative inline-block", sideboard && "opacity-55");

  if (!openCardDetail || printingId === null) {
    return (
      <span className={className} title={card.cardName}>
        {art}
      </span>
    );
  }
  return (
    <Pressable
      className={className}
      aria-label={label}
      title={card.cardName}
      onClick={() => openCardDetail({ printingId, sequence })}
    >
      {art}
    </Pressable>
  );
}

/** Suspends on the deck query; mount it under a Suspense boundary with {@link MetaEventDeckPreviewSkeleton}. */
export function MetaEventDeckPreview({ token }: { token: string }) {
  const { data } = useMetaDeck(token);
  const copyToMyDecks = useCopyArchivedDeck();
  const encodeMutation = useEncodeDeckCards();
  const { copied, copy } = useCopyToClipboard();

  const lead = [
    ...zoneCards(data.cards, WellKnown.deckZone.CHAMPION),
    ...zoneCards(data.cards, WellKnown.deckZone.BATTLEFIELD),
  ];
  const main = zoneCards(data.cards, WellKnown.deckZone.MAIN).toSorted(byEnergyThenName);
  const sideboard = zoneCards(data.cards, WellKnown.deckZone.SIDEBOARD).toSorted(byEnergyThenName);
  const groups = [
    { key: "lead", cards: lead, sideboard: false },
    { key: "main", cards: main, sideboard: false },
    { key: "sideboard", cards: sideboard, sideboard: true },
  ].filter((group) => group.cards.length > 0);
  const sequence = [...lead, ...main, ...sideboard]
    .map((card) => printingIdOf(card))
    .filter((id) => id !== null);

  const types = deckTypeSplit(data.cards);
  const runes = deckRuneSplit(data.cards);
  const sideboardCount = sideboard.reduce((sum, card) => sum + card.quantity, 0);
  const missing = describeIncompleteList(
    data.deck.format,
    unknownZoneCounts(data.cards, data.deck.format, data.meta.listStatus),
  );

  const encodeCards = toEncodeDeckCards(data.cards);
  const handleCopyCode = async () => {
    try {
      const encoded = await encodeMutation.mutateAsync({ cards: encodeCards });
      await copy(encoded.code);
      reportEncodeWarnings(encoded.warnings);
    } catch {
      /* Reported by the global mutation error toast. */
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1.5">
        {groups.map((group) => (
          <div key={group.key} data-group={group.key} className="flex flex-wrap items-end gap-1">
            {group.cards.map((card) => (
              <StripCard
                key={card.cardId}
                card={card}
                sequence={sequence}
                sideboard={group.sideboard}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {types.total > 0 && (
          <span className="tabular-nums">
            {types.units} units · {types.spells} spells · {types.gear} gear
          </span>
        )}
        {runes.length > 0 && (
          <span className="flex items-center gap-x-2">
            {runes.map((rune) => (
              <span key={rune.domain} className="flex items-center gap-1">
                <DomainIcon domain={rune.domain} className="size-3.5" />
                <span className="tabular-nums">{rune.count}</span>
              </span>
            ))}
          </span>
        )}
        {sideboardCount > 0 && <span className="tabular-nums">Sideboard {sideboardCount}</span>}
        {missing !== null && <span>{missing}</span>}
        <MetaContributors contributors={data.meta.contributors} className="text-xs" />
        {!copyToMyDecks.isLoggedIn && (
          <Link
            to="/login"
            search={{ redirect: `/meta/${data.meta.event.slug}`, email: undefined }}
            className="text-primary hover:underline"
          >
            Sign in to compare with your collection
          </Link>
        )}
        <span className="ml-auto" />
        <span className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Decklist actions" />}
            >
              <EllipsisVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={copyToMyDecks.isPending}
                onClick={() =>
                  void copyToMyDecks.copy({ token, deck: data.deck, cards: data.cards })
                }
              >
                <CopyIcon />
                {copyToMyDecks.label}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={encodeMutation.isPending}
                onClick={() => void handleCopyCode()}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? "Copied" : "Copy deck code"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" render={<Link to="/meta/decks/$token" params={{ token }} />}>
            Open deck
          </Button>
        </span>
      </div>
    </div>
  );
}

export function MetaEventDeckPreviewSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-end gap-1">
        {Array.from({ length: SKELETON_THUMBS }, (_, index) => (
          <Skeleton key={index} className="aspect-card w-9" />
        ))}
      </div>
      <Skeleton className="h-3 w-64" />
    </div>
  );
}
