import type { ListKind, Marketplace } from "@openrift/shared";
import { straightenApostrophes } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon, CopyIcon, HeartIcon, LockIcon, ShoppingCartIcon } from "lucide-react";
import { useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { AddToWishlistDialog } from "@/components/list/add-to-wishlist-dialog";
import { CreateListDialog } from "@/components/list/create-list-dialog";
import { MarketplaceLink } from "@/components/marketplace-link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { CardOwnership } from "@/hooks/use-deck-ownership";
import { useEnumOrders } from "@/hooks/use-enums";
import { useMarketplaceInfo } from "@/hooks/use-marketplace-info";
import { missingCardsToListEntries, missingCardsToWants } from "@/lib/deck-missing-export";
import { zoneLabel } from "@/lib/deck-zone-labels";
import { formatterForMarketplace } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { formatCardmarketWants } from "@/lib/list-export";
import { MARKETPLACE_META } from "@/lib/marketplace-meta";

interface DeckMissingCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingCards: CardOwnership[];
  totalMissingValue: number | undefined;
  marketplace: Marketplace;
  /**
   * "missing" (default) frames the list as cards the viewer still needs;
   * "prices" drops the ownership framing for anonymous viewers and shows
   * the same rows as a price breakdown for the whole deck.
   */
  mode?: "missing" | "prices";
  /**
   * Deck name used to pre-fill the wishlist name. When provided (and mode is
   * "missing"), a "Create wishlist" button is shown that opens the
   * wishlist-creation dialog seeded with these missing cards.
   */
  deckName?: string;
}

/**
 * Card rarity icon, short code, and display name. Links to the in-app card
 * detail page when a slug is known; falls back to plain text otherwise (a card
 * with no catalog printings has no slug to link to).
 * @returns The card identification content.
 */
function CardIdentity({
  card,
  rarityLabel,
}: {
  card: CardOwnership;
  rarityLabel: string | undefined;
}) {
  const content = (
    <>
      {card.displayPrinting && (
        <img
          src={getFilterIconPath("rarities", card.displayPrinting.rarity)}
          alt={rarityLabel}
          title={rarityLabel}
          width={28}
          height={28}
          className="size-3.5 shrink-0"
        />
      )}
      <span className="text-muted-foreground font-mono">
        {card.displayPrinting?.shortCode ?? "--"}
      </span>
      <span>{card.displayName}</span>
    </>
  );

  if (card.cardSlug === undefined) {
    return <span className="inline-flex items-center gap-1.5">{content}</span>;
  }

  return (
    <Link
      to="/cards/$cardSlug"
      params={{ cardSlug: card.cardSlug }}
      className="hover:text-foreground inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
    >
      {content}
    </Link>
  );
}

/**
 * Footer copy button with its own copied-feedback state, so the readable list
 * and the Cardmarket export can sit side by side without sharing feedback.
 * @returns The copy button.
 */
function CopyTextButton({ label, getText }: { label: string; getText: () => string }) {
  const { copied, copy } = useCopyToClipboard();

  // Use \r\n so line breaks survive iOS Safari's clipboard
  const handleCopy = () => void copy(getText().replaceAll("\n", "\r\n"));

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? (
        <>
          <CheckIcon className="size-3.5" />
          Copied
        </>
      ) : (
        <>
          <CopyIcon className="size-3.5" />
          {label}
        </>
      )}
    </Button>
  );
}

/**
 * Builds the "why is this locked" tooltip sentence for a missing-card row,
 * branching on which reasons actually contributed: out on loan, reserved for
 * a trade, or sitting in a collection excluded from deck building. Several
 * reasons read as alternatives ("out on loan or reserved for a trade"), since
 * the per-reason counts are not zone-capped the way `locked` is and so must
 * not be shown beside it.
 * @returns The tooltip sentence.
 */
function lockedTooltipText(card: CardOwnership): string {
  const reasons: string[] = [];
  if (card.lockedLoaned > 0) {
    reasons.push("out on loan");
  }
  if (card.lockedReserved > 0) {
    reasons.push("reserved for a trade");
  }
  if (card.lockedExcluded > 0) {
    reasons.push("in a collection that's excluded from deck building");
  }

  const copyWord = card.locked === 1 ? "copy" : "copies";
  if (reasons.length <= 1) {
    const reason = reasons[0] ?? "you can't build with right now";
    return `You have ${card.locked} ${copyWord} ${reason}.`;
  }
  const last = reasons.at(-1);
  const rest = reasons.slice(0, -1).join(", ");
  return `You have ${card.locked} ${copyWord} that are ${rest} or ${last}.`;
}

export function DeckMissingCardsDialog({
  open,
  onOpenChange,
  missingCards,
  totalMissingValue,
  marketplace,
  mode = "missing",
  deckName,
}: DeckMissingCardsDialogProps) {
  const [wishlistPickerOpen, setWishlistPickerOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const navigate = useNavigate();
  const fmt = formatterForMarketplace(marketplace);
  const meta = MARKETPLACE_META[marketplace];
  const { labels: enumLabels } = useEnumOrders();

  const sorted = missingCards.toSorted((a, b) => {
    const zoneCmp = zoneLabel(a.zone).localeCompare(zoneLabel(b.zone));
    if (zoneCmp !== 0) {
      return zoneCmp;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  const groupedByZone = [...Map.groupBy(sorted, (card) => card.zone).entries()];

  // Fetch marketplace source metadata only when the dialog is open, so we don't
  // send the extra request until the user actually needs the deep-link URLs.
  const printingIds = open
    ? sorted.flatMap((card) => (card.displayPrinting ? [card.displayPrinting.id] : []))
    : [];
  const { data: marketplaceInfo } = useMarketplaceInfo(printingIds);

  const linkFor = (card: CardOwnership): string => {
    const printing = card.displayPrinting;
    const info = printing ? marketplaceInfo?.infos[printing.id]?.[marketplace] : undefined;
    if (printing && info?.available && info.productId !== null) {
      return meta.productUrl(info.productId, printing.language);
    }
    return meta.searchUrl(card.cardName);
  };

  const listText = () =>
    sorted
      .map((card) => {
        const code = card.displayPrinting?.shortCode;
        const cardName = straightenApostrophes(card.cardName);
        const namePart = code ? `${code} ${cardName}` : cardName;
        const price =
          card.displayPrice === undefined ? "" : ` - ${fmt(card.displayPrice * card.shortfall)}`;
        return `${card.shortfall}x ${namePart}${price}`;
      })
      .join("\n");

  // Pure `Nx Name` lines — Cardmarket's wants import matches by card name, so
  // the short codes and prices of the readable list above would break it.
  const cardmarketText = () => formatCardmarketWants(missingCardsToWants(sorted));

  const totalMissing = sorted.reduce((sum, card) => sum + card.shortfall, 0);

  const buildWishlistEntries = (kind: ListKind) => missingCardsToListEntries(sorted, kind);

  const showWishlistButton = mode === "missing" && deckName !== undefined && sorted.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "prices"
              ? `Card prices (${totalMissing})`
              : `Missing cards (${totalMissing})`}
          </DialogTitle>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <img src={meta.icon} alt="" className="h-3 invert dark:invert-0" />
            Prices from {meta.label}
          </div>
        </DialogHeader>

        {/* scrollbar-gutter keeps a classic scrollbar out of the row; the row's
            pr-3 keeps the cart clear of an overlay scrollbar. */}
        <div className="max-h-80 [scrollbar-gutter:stable] overflow-y-auto text-sm">
          {groupedByZone.map(([zone, cards]) => (
            <div key={zone} className="pt-3 first:pt-0">
              <div className="text-muted-foreground px-2 pb-1 text-xs font-medium tracking-wide uppercase">
                {zoneLabel(zone)}
              </div>
              {cards.map((card) => (
                <div
                  key={`${card.cardId}:${card.zone}`}
                  className="hover:bg-muted/40 flex items-center gap-2 rounded-md py-1.5 pr-3 pl-2 sm:gap-3"
                >
                  {/* Small card thumbnail alongside the two stacked rows on mobile;
                      hidden on desktop where the row is a single line. */}
                  <CardArtThumb
                    imageId={card.displayPrinting?.imageId}
                    landscape={card.displayPrinting?.landscape}
                    rarity={card.displayPrinting?.rarity}
                    loading="lazy"
                    className="h-10 sm:hidden"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:contents">
                    <div className="flex min-w-0 items-center gap-1.5 sm:flex-1">
                      <CardIdentity
                        card={card}
                        rarityLabel={
                          card.displayPrinting
                            ? enumLabels.rarities[card.displayPrinting.rarity]
                            : undefined
                        }
                      />
                      {card.locked > 0 && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="text-muted-foreground inline-flex items-center" />
                            }
                          >
                            <LockIcon className="size-3" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-56 text-xs">
                            {lockedTooltipText(card)}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {/* On mobile this pair is its own row (copies left, buy right); on
                      desktop `contents` dissolves the wrapper so both align inline. */}
                    <div className="flex items-center justify-between gap-3 sm:contents">
                      <div className="whitespace-nowrap sm:text-right">
                        {card.displayPrice === undefined ? (
                          <span className="text-muted-foreground">{card.shortfall} × --</span>
                        ) : card.shortfall === 1 ? (
                          <span className="font-medium">{fmt(card.displayPrice)}</span>
                        ) : (
                          <>
                            <span className="text-muted-foreground">
                              {card.shortfall} × {fmt(card.displayPrice)} ={" "}
                            </span>
                            <span className="font-medium">
                              {fmt(card.displayPrice * card.shortfall)}
                            </span>
                          </>
                        )}
                      </div>
                      <MarketplaceLink
                        marketplace={marketplace}
                        href={linkFor(card)}
                        title={`Buy on ${meta.label}`}
                        aria-label={`Buy ${card.displayName} on ${meta.label}`}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-7 shrink-0 items-center justify-center rounded-md"
                      >
                        <ShoppingCartIcon className="size-4" />
                      </MarketplaceLink>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {totalMissingValue !== undefined && (
          <div className="text-muted-foreground flex items-center justify-between border-t px-2 pt-2 text-sm">
            <span>Total</span>
            <span className="text-foreground font-medium">{fmt(totalMissingValue)}</span>
          </div>
        )}

        <DialogFooter>
          {showWishlistButton && (
            <Button variant="outline" size="sm" onClick={() => setWishlistPickerOpen(true)}>
              <HeartIcon className="size-3.5" />
              Add to wishlist
            </Button>
          )}
          <CopyTextButton label="Copy for Cardmarket" getText={cardmarketText} />
          <CopyTextButton label="Copy list" getText={listText} />
        </DialogFooter>
      </DialogContent>
      {showWishlistButton && (
        <AddToWishlistDialog
          open={wishlistPickerOpen}
          onOpenChange={setWishlistPickerOpen}
          entriesFor={buildWishlistEntries}
          onCreateNew={() => setWishlistOpen(true)}
          onAdded={() => onOpenChange(false)}
        />
      )}
      {showWishlistButton && (
        <CreateListDialog
          intent="wish"
          open={wishlistOpen}
          onOpenChange={setWishlistOpen}
          defaultName={`${deckName} - Missing`}
          initialEntries={buildWishlistEntries}
          title={`New wishlist for "${deckName}"`}
          description="Pick whether any version of the card works, or you want a specific one."
          kindHints={{
            card: "Any printing of each card counts. Pick this if you just want to play the deck.",
            printing:
              "Only the exact printings from the deck count. Pick this if you want a specific set, art, or finish.",
          }}
          onCreated={(listId) => {
            onOpenChange(false);
            void navigate({
              to: "/collections/lists/$listId",
              params: { listId },
            });
          }}
        />
      )}
    </Dialog>
  );
}
