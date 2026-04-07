import type { DeckFormat, DeckListItemResponse, DeckResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PrinterIcon,
  RefreshCwIcon,
  Share2Icon,
  SwordsIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCards } from "@/hooks/use-cards";
import {
  deckDetailQueryOptions,
  useCloneDeck,
  useDeleteDeck,
  useUpdateDeck,
} from "@/hooks/use-decks";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { getDomainGradientStyle } from "@/lib/domain";
import { formatterForMarketplace } from "@/lib/format";
import { getCardImageSrcSet, getCardImageUrl } from "@/lib/images";
import type { DeckBuilderCard } from "@/stores/deck-builder-store";
import { toDeckBuilderCard } from "@/stores/deck-builder-store";
import { useDisplayStore } from "@/stores/display-store";

import { DeckDomainBar } from "./deck-domain-bar";
import { DeckExportDialog } from "./deck-export-dialog";
import { ProxyExportDialog } from "./proxy-export-dialog";

function DomainIcon({ domain }: { domain: string }) {
  const lower = domain.toLowerCase();
  const ext = domain === WellKnown.domain.COLORLESS ? "svg" : "webp";
  return (
    <Tooltip>
      <TooltipTrigger>
        <img src={`/images/domains/${lower}.${ext}`} alt={domain} className="size-6" />
      </TooltipTrigger>
      <TooltipContent>{domain}</TooltipContent>
    </Tooltip>
  );
}

function CardPreviewImage({
  imageUrl,
  alt,
  sizes,
  className,
  style,
}: {
  imageUrl: string;
  alt: string;
  sizes: string;
  className: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={getCardImageUrl(imageUrl, "thumbnail")}
      srcSet={getCardImageSrcSet(imageUrl)}
      sizes={sizes}
      alt={alt}
      loading="lazy"
      className={className}
      style={{ aspectRatio: "63 / 88", ...style }}
    />
  );
}

function FannedPreview({
  legendImage,
  championImage,
  gradientStyle,
}: {
  legendImage?: string | null;
  championImage?: string | null;
  gradientStyle?: React.CSSProperties;
}) {
  const singleImage = legendImage ?? championImage;

  if (legendImage && championImage) {
    return (
      <div
        className="bg-muted/30 relative flex items-center justify-center overflow-hidden"
        style={{ aspectRatio: "5 / 3" }}
      >
        <CardPreviewImage
          imageUrl={legendImage}
          alt="Legend"
          sizes="160px"
          className="absolute h-[85%] rounded-lg object-cover shadow-md"
          style={{ left: "12%", transform: "rotate(-6deg)" }}
        />
        <CardPreviewImage
          imageUrl={championImage}
          alt="Champion"
          sizes="160px"
          className="absolute h-[85%] rounded-lg object-cover shadow-md"
          style={{ right: "12%", transform: "rotate(6deg)" }}
        />
      </div>
    );
  }

  if (singleImage) {
    return (
      <div
        className="bg-muted/30 relative flex items-center justify-center overflow-hidden"
        style={{ aspectRatio: "5 / 3" }}
      >
        <CardPreviewImage
          imageUrl={singleImage}
          alt="Card"
          sizes="200px"
          className="h-[90%] rounded-lg object-cover shadow-md"
        />
      </div>
    );
  }

  return (
    <div
      className="bg-muted/30 relative flex items-center justify-center overflow-hidden"
      style={{ aspectRatio: "5 / 3", ...gradientStyle }}
    >
      <SwordsIcon className="text-muted-foreground/30 size-12" />
    </div>
  );
}

/**
 * Resolves the front image URL for a card from the catalog printings.
 * Picks the canonical printing: normal art variant, non-promo, non-signed, normal finish.
 * @returns The front image URL, or null if not found.
 */
function resolveCardImage(
  allPrintings: ReturnType<typeof useCards>["allPrintings"],
  cardId: string,
): string | null {
  const candidates = allPrintings
    .filter((entry) => entry.card.id === cardId)
    .toSorted(
      (a, b) =>
        a.shortCode.localeCompare(b.shortCode) ||
        Number(Boolean(a.promoType)) - Number(Boolean(b.promoType)) ||
        Number(a.finish !== "normal") - Number(b.finish !== "normal"),
    );
  const frontImage = candidates[0]?.images.find((img) => img.face === "front");
  return frontImage?.url ?? null;
}

/**
 * Visual tile for a single deck in the deck grid.
 * @returns The deck tile element.
 */
export function DeckTile({ item }: { item: DeckListItemResponse }) {
  const {
    deck,
    legendCardId,
    championCardId,
    totalCards,
    typeCounts,
    domainDistribution,
    isValid,
    totalValueCents,
  } = item;
  const navigate = useNavigate();
  const cloneDeck = useCloneDeck();
  const updateDeck = useUpdateDeck();
  const { allPrintings } = useCards();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(deck.name);
  const deleteDeck = useDeleteDeck();

  // Resolve legend/champion card details from catalog
  const legendCard = legendCardId
    ? allPrintings.find((entry) => entry.card.id === legendCardId)?.card
    : undefined;
  const championCard = championCardId
    ? allPrintings.find((entry) => entry.card.id === championCardId)?.card
    : undefined;
  const legendImage = legendCardId ? resolveCardImage(allPrintings, legendCardId) : null;
  const championImage = championCardId ? resolveCardImage(allPrintings, championCardId) : null;

  // Lazy-fetch full card detail only when export/proxy dialogs are open
  const needsDetail = exportOpen || proxyOpen;
  const { data: detail } = useQuery({
    ...deckDetailQueryOptions(deck.id),
    enabled: needsDetail,
  });
  const { cardsById } = useCards();
  const detailCards = detail
    ? detail.cards
        .map((card) => toDeckBuilderCard(card, cardsById))
        .filter((card): card is DeckBuilderCard => card !== null)
    : undefined;

  const handleClone = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    cloneDeck.mutate(deck.id, {
      onSuccess: (data) => {
        const newDeck = data as DeckResponse;
        void navigate({ to: "/decks/$deckId", params: { deckId: newDeck.id } });
      },
    });
  };

  const handleDeleteClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDeleteOpen(true);
  };

  const handleDelete = () => {
    deleteDeck.mutate(deck.id);
    setDeleteOpen(false);
  };

  const handleRename = () => {
    const trimmed = renameName.trim();
    if (trimmed && trimmed !== deck.name) {
      updateDeck.mutate({ deckId: deck.id, name: trimmed });
    }
    setRenameOpen(false);
  };

  const handleFormatToggle = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const newFormat: DeckFormat = deck.format === "standard" ? "freeform" : "standard";
    updateDeck.mutate({ deckId: deck.id, format: newFormat });
  };

  const domainColors = useDomainColors();
  const legendDomains = legendCard?.domains;
  const createdDate = new Date(deck.createdAt).toISOString().slice(0, 10);
  const updatedDate = new Date(deck.updatedAt).toISOString().slice(0, 10);

  const typeSummary = typeCounts
    .map(({ cardType, count }) => `${count} ${count === 1 ? cardType : `${cardType}s`}`)
    .join(" · ");

  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "18", domainColors)
      : undefined;

  return (
    <>
      <Link
        to="/decks/$deckId"
        params={{ deckId: deck.id }}
        className="hover:ring-ring/40 group flex flex-col overflow-hidden rounded-xl border transition-shadow hover:ring-2"
        style={gradientStyle}
      >
        <FannedPreview
          legendImage={legendImage}
          championImage={championImage}
          gradientStyle={
            legendDomains && legendDomains.length > 0
              ? getDomainGradientStyle(legendDomains, "40", domainColors)
              : undefined
          }
        />

        <div className="flex flex-1 flex-col gap-2 p-3">
          {/* Name */}
          <div className="min-w-0">
            <h3 className="truncate leading-tight font-semibold">{deck.name}</h3>
            {(legendCard || championCard) && (
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {[legendCard?.name, championCard?.name].filter(Boolean).join(" / ")}
              </p>
            )}
          </div>

          {/* Domain icons, type counts + format badge */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              {legendDomains?.map((domain) => (
                <DomainIcon key={domain} domain={domain} />
              ))}
              {typeSummary && (
                <span className="text-muted-foreground ml-1 text-[10px]">{typeSummary}</span>
              )}
            </span>
            {deck.format === "freeform" ? (
              <Badge variant="outline" className="text-xs">
                Freeform
              </Badge>
            ) : isValid ? (
              <Badge
                variant="outline"
                className="border-green-600/30 bg-green-600/10 text-xs text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400"
              >
                <CheckIcon className="size-3" />
                Standard
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-amber-600/30 bg-amber-600/10 text-xs text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
              >
                <CircleAlertIcon className="size-3" />
                Standard
              </Badge>
            )}
          </div>

          {/* Domain distribution */}
          {domainDistribution.length > 0 && <DeckDomainBar distribution={domainDistribution} />}

          {/* Footer */}
          <div className="text-muted-foreground mt-auto flex items-center gap-1.5 pt-1 text-xs">
            <span>
              {createdDate}
              {updatedDate !== createdDate && ` (updated ${updatedDate})`}
            </span>
            <span>·</span>
            <span>{totalCards} cards</span>
            {totalValueCents !== null && totalValueCents > 0 && (
              <>
                <span>·</span>
                <span>
                  {formatterForMarketplace(marketplaceOrder[0] ?? "tcgplayer")(
                    totalValueCents / 100,
                  )}
                </span>
              </>
            )}
            <span className="flex-1" />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" />}
                onClick={(event: React.MouseEvent) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <EllipsisVerticalIcon className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(event: React.MouseEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setExportOpen(true);
                  }}
                >
                  <Share2Icon className="size-4" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event: React.MouseEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setProxyOpen(true);
                  }}
                >
                  <PrinterIcon className="size-4" />
                  Proxies
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event: React.MouseEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setRenameName(deck.name);
                    setRenameOpen(true);
                  }}
                >
                  <PencilIcon className="size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleFormatToggle}>
                  <RefreshCwIcon className="size-4" />
                  {deck.format === "standard" ? "Change to freeform" : "Change to standard"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClone}>
                  <CopyIcon className="size-4" />
                  Clone
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDeleteClick}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Link>

      <DeckExportDialog
        deckId={deck.id}
        deckName={deck.name}
        isDirty={false}
        open={exportOpen}
        onOpenChange={setExportOpen}
        cards={detailCards}
      />

      <ProxyExportDialog open={proxyOpen} onOpenChange={setProxyOpen} cards={detailCards} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deck</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deck.name}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) {
            setRenameName(deck.name);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename deck</DialogTitle>
            <DialogDescription>Enter a new name for your deck.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleRename();
            }}
          >
            <Input
              ref={(node) => {
                node?.focus();
              }}
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              maxLength={100}
            />
            <DialogFooter className="mt-4">
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={!renameName.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
