import type { ListKind } from "@openrift/shared/types/api/list";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { straightenApostrophes } from "@openrift/shared/utils";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDownLeftIcon, HeartIcon, LockIcon, ShoppingCartIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardDetailOverlay } from "@/components/cards/card-detail-overlay";
import { AddToWishlistDialog } from "@/components/list/add-to-wishlist-dialog";
import { CreateListDialog } from "@/components/list/create-list-dialog";
import { MarketplaceLink } from "@/components/marketplace-link";
import { CopyTextButton } from "@/components/share/copy-text-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pressable } from "@/components/ui/pressable";
import { SectionHeading } from "@/components/ui/section-heading";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEnumOrders } from "@/hooks/use-enums";
import { useMarketplaceInfo } from "@/hooks/use-marketplace-info";
import { missingCardsToListEntries, missingCardsToWants } from "@/lib/deck-missing-export";
import type { CardOwnership } from "@/lib/deck-ownership-types";
import { zoneLabel } from "@/lib/deck-zone-labels";
import { formatterForMarketplace } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { formatCardmarketWants } from "@/lib/list-export";
import { MARKETPLACE_META } from "@/lib/marketplace-meta";
import { useDisplayStore } from "@/stores/display-store";

interface DeckMissingCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingCards: CardOwnership[];
  totalMissingValue: number | undefined;
  marketplace: Marketplace;
  /** "prices" drops the ownership framing and shows a price breakdown instead. */
  mode?: "missing" | "prices";
  /** Pre-fills the wishlist name; shows the "Create wishlist" button when set (mode "missing"). */
  deckName?: string;
}

function CardIdentity({
  card,
  printing,
  rarityLabel,
  onOpenDetail,
}: {
  card: CardOwnership;
  printing: CardOwnership["displayPrinting"];
  rarityLabel: string | undefined;
  onOpenDetail: (printingId: string) => void;
}) {
  const content = (
    <>
      {printing && (
        <img
          src={getFilterIconPath("rarities", printing.rarity)}
          alt={rarityLabel}
          title={rarityLabel}
          width={28}
          height={28}
          className="size-3.5 shrink-0"
        />
      )}
      <span className="text-muted-foreground font-mono">{printing?.shortCode ?? "--"}</span>
      <span>{card.displayName}</span>
    </>
  );

  if (printing === undefined) {
    return <span className="inline-flex items-center gap-1.5">{content}</span>;
  }

  return (
    <Pressable
      onClick={() => onOpenDetail(printing.id)}
      className="hover:text-foreground inline-flex items-center gap-1.5 rounded-sm underline-offset-2 hover:underline"
    >
      {content}
    </Pressable>
  );
}

// Reasons are joined as alternatives, not counted per-reason: the per-reason
// counts aren't zone-capped the way `locked` is, so they can't be shown beside it.
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

// Incoming copies aren't locked and aren't the viewer's yet: they explain
// part of the shortfall without reducing it.
function incomingTooltipText(card: CardOwnership): string {
  return card.incoming === 1
    ? "1 copy is on the way from a trade. It'll count once you've got it."
    : `${card.incoming} copies are on the way from a trade. They'll count once you've got them.`;
}

// A suspending read inside this dialog, mounted while closed, would else be
// caught by the page's own boundary and hide the whole page mid-edit.
export function DeckMissingCardsDialog(props: DeckMissingCardsDialogProps) {
  return (
    <Suspense fallback={null}>
      <MissingCardsDialogBody {...props} />
    </Suspense>
  );
}

function MissingCardsDialogBody({
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
  // The raw setter is handed to the overlay: it needs a stable identity for its history entry.
  const [detailPrintingId, setDetailPrintingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const fmt = formatterForMarketplace(marketplace);
  const meta = MARKETPLACE_META[marketplace];
  const { labels: enumLabels } = useEnumOrders();
  const showImages = useDisplayStore((s) => s.showImages);

  const sorted = missingCards.toSorted((a, b) => {
    const zoneCmp = zoneLabel(a.zone).localeCompare(zoneLabel(b.zone));
    if (zoneCmp !== 0) {
      return zoneCmp;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  const groupedByZone = [...Map.groupBy(sorted, (card) => card.zone).entries()];

  // Rows deep-link to the completion printing (cheapest one that fills the
  // shortfall), not the deck's displayed pin.
  const rowPrintingIds = sorted.flatMap((card) => {
    const printing = card.cheapestPrinting ?? card.displayPrinting;
    return printing ? [printing.id] : [];
  });

  const { data: marketplaceInfo } = useMarketplaceInfo(open ? rowPrintingIds : []);

  const linkFor = (card: CardOwnership, printing: CardOwnership["displayPrinting"]): string => {
    const info = printing ? marketplaceInfo?.infos[printing.id]?.[marketplace] : undefined;
    if (printing && info?.available && info.productId !== null) {
      return meta.productUrl(info.productId, printing.language);
    }
    return meta.searchUrl(card.cardName);
  };

  const listText = () =>
    sorted
      .map((card) => {
        const printing = card.cheapestPrinting ?? card.displayPrinting;
        const price = card.cheapestPrice ?? card.displayPrice;
        const code = printing?.shortCode;
        const cardName = straightenApostrophes(card.cardName);
        const namePart = code ? `${code} ${cardName}` : cardName;
        const priceText = price === undefined ? "" : ` - ${fmt(price * card.shortfall)}`;
        return `${card.shortfall}x ${namePart}${priceText}`;
      })
      .join("\n");

  // Cardmarket's wants import matches by card name; short codes or prices break it.
  const cardmarketText = () => formatCardmarketWants(missingCardsToWants(sorted));

  const totalMissing = sorted.reduce((sum, card) => sum + card.shortfall, 0);

  const buildWishlistEntries = (kind: ListKind) => missingCardsToListEntries(sorted, kind);

  const showWishlistButton = mode === "missing" && deckName !== undefined && sorted.length > 0;

  const handleSearchAndClose = (query: string) => {
    setDetailPrintingId(null);
    onOpenChange(false);
    void navigate({ to: "/cards", search: { search: query } });
  };

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

        <div className="max-h-80 [scrollbar-gutter:stable] overflow-y-auto text-sm">
          {groupedByZone.map(([zone, cards]) => (
            <div key={zone} className="pt-3 first:pt-0">
              <SectionHeading as="h3" className="px-2 pb-1">
                {zoneLabel(zone)}
              </SectionHeading>
              {cards.map((card) => {
                const printing = card.cheapestPrinting ?? card.displayPrinting;
                const price = card.cheapestPrice ?? card.displayPrice;
                return (
                  <div
                    key={`${card.cardId}:${card.zone}`}
                    className="hover:bg-muted/50 flex items-center gap-2 rounded-md py-1.5 pr-3 pl-2 sm:gap-3"
                  >
                    <CardArtThumb
                      shape="strip"
                      imageId={printing?.imageId}
                      landscape={printing?.landscape}
                      rarity={printing?.rarity}
                      loading="lazy"
                      className="h-9 sm:hidden"
                    />
                    {/* sm:contents dissolves this wrapper so the cart stays a direct
                        child of the row and centers on the full row height. */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:contents">
                      <div className="flex min-w-0 items-center gap-1.5 sm:flex-1">
                        <CardIdentity
                          card={card}
                          printing={printing}
                          rarityLabel={printing ? enumLabels.rarities[printing.rarity] : undefined}
                          onOpenDetail={setDetailPrintingId}
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
                        {card.incoming > 0 && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="text-muted-foreground inline-flex items-center" />
                              }
                            >
                              <ArrowDownLeftIcon className="size-3" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-56 text-xs">
                              {incomingTooltipText(card)}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="whitespace-nowrap sm:text-right">
                        {price === undefined ? (
                          <span className="text-muted-foreground">{card.shortfall} × --</span>
                        ) : card.shortfall === 1 ? (
                          <span className="font-medium">{fmt(price)}</span>
                        ) : (
                          <>
                            <span className="text-muted-foreground">
                              {card.shortfall} × {fmt(price)} ={" "}
                            </span>
                            <span className="font-medium">{fmt(price * card.shortfall)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <MarketplaceLink
                      marketplace={marketplace}
                      href={linkFor(card, printing)}
                      title={`Buy on ${meta.label}`}
                      aria-label={`Buy ${card.displayName} on ${meta.label}`}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-7 shrink-0 items-center justify-center rounded-md"
                    >
                      <ShoppingCartIcon className="size-4" />
                    </MarketplaceLink>
                  </div>
                );
              })}
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
          <CopyTextButton label="Copy for Cardmarket" getText={cardmarketText} size="sm" />
          <CopyTextButton label="Copy list" getText={listText} size="sm" />
        </DialogFooter>
      </DialogContent>
      <CardDetailOverlay
        printingIds={rowPrintingIds}
        openPrintingId={detailPrintingId}
        onOpenPrintingIdChange={setDetailPrintingId}
        showImages={showImages}
        onSearchAndClose={handleSearchAndClose}
        // Must differ from the page's own store-driven overlay's history key.
        historyKey="missingCardDetail"
      />
      {/* Mounted only while open: AddToWishlistDialog suspends on a wishlists
          query in its body, and this dialog stays mounted while closed. */}
      {showWishlistButton && wishlistPickerOpen && (
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
