import type { CardType, DeckCardResponse, DeckResponse, Domain } from "@openrift/shared";
import { CARD_TYPE_ORDER, COLORLESS_DOMAIN, validateDeck } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  PrinterIcon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCloneDeck, useDeleteDeck } from "@/hooks/use-decks";
import { getDomainGradientStyle } from "@/lib/domain";
import { formatterForMarketplace } from "@/lib/format";
import { getCardImageSrcSet, getCardImageUrl } from "@/lib/images";
import { toDeckBuilderCard } from "@/stores/deck-builder-store";
import { useDisplayStore } from "@/stores/display-store";

import { DeckDomainBar } from "./deck-domain-bar";
import { DeckExportDialog } from "./deck-export-dialog";
import { ProxyExportDialog } from "./proxy-export-dialog";

function DomainIcon({ domain }: { domain: string }) {
  const lower = domain.toLowerCase();
  const ext = domain === COLORLESS_DOMAIN ? "svg" : "webp";
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
  legendDomains,
}: {
  legendImage?: string | null;
  championImage?: string | null;
  legendDomains?: Domain[];
}) {
  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "40")
      : undefined;

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
 * Visual tile for a single deck in the deck grid.
 * @returns The deck tile element.
 */
export function DeckTile({
  deck,
  cards,
  totalValueCents,
}: {
  deck: DeckResponse;
  cards?: DeckCardResponse[];
  totalValueCents: number | null;
}) {
  const navigate = useNavigate();
  const cloneDeck = useCloneDeck();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const deleteDeck = useDeleteDeck();

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

  const legend = cards?.find((card) => card.zone === "legend");
  const champion = cards?.find((card) => card.zone === "champion");
  const legendDomains = legend?.domains as Domain[] | undefined;
  const createdDate = new Date(deck.createdAt).toISOString().slice(0, 10);
  const updatedDate = new Date(deck.updatedAt).toISOString().slice(0, 10);
  const totalCards = cards
    ? cards.filter((card) => card.zone !== "overflow").reduce((sum, card) => sum + card.quantity, 0)
    : 0;

  const excludedTypes = new Set(["Legend", "Rune", "Battlefield"]);
  const countedZones = new Set(["main", "champion"]);
  const typeCounts = new Map<CardType, number>();
  if (cards) {
    for (const card of cards) {
      if (!countedZones.has(card.zone) || excludedTypes.has(card.cardType)) {
        continue;
      }
      typeCounts.set(card.cardType, (typeCounts.get(card.cardType) ?? 0) + card.quantity);
    }
  }
  const typeSummary = CARD_TYPE_ORDER.filter((type) => typeCounts.has(type))
    .map((type) => {
      const count = typeCounts.get(type) ?? 0;
      return `${count} ${count === 1 ? type : `${type}s`}`;
    })
    .join(" · ");

  const isStandardValid =
    deck.format === "standard" &&
    cards &&
    validateDeck({
      format: "standard",
      cards: cards.map((card) => ({
        cardId: card.cardId,
        zone: card.zone,
        quantity: card.quantity,
        cardName: card.cardName,
        cardType: card.cardType,
        superTypes: card.superTypes,
        domains: card.domains,
        tags: card.tags,
      })),
    }).length === 0;

  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "18")
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
          legendImage={legend?.imageUrl}
          championImage={champion?.imageUrl}
          legendDomains={legendDomains}
        />

        <div className="flex flex-1 flex-col gap-2 p-3">
          {/* Name */}
          <div className="min-w-0">
            <h3 className="truncate leading-tight font-semibold">{deck.name}</h3>
            {(legend || champion) && (
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {[legend?.cardName, champion?.cardName].filter(Boolean).join(" / ")}
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
            ) : isStandardValid ? (
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
          {cards && <DeckDomainBar cards={cards} />}

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
        isDirty={false}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />

      <ProxyExportDialog
        open={proxyOpen}
        onOpenChange={setProxyOpen}
        cards={cards?.map((card) => toDeckBuilderCard(card))}
      />

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
    </>
  );
}
