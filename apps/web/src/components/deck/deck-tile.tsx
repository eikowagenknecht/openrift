import type { DeckCardResponse, DeckResponse, Domain } from "@openrift/shared";
import { COLORLESS_DOMAIN, validateDeck } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Copy, MoreHorizontal, Share2, Swords, Trash2 } from "lucide-react";
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
import { useCloneDeck, useDeleteDeck } from "@/hooks/use-decks";
import { getDomainGradientStyle } from "@/lib/domain";
import { getCardImageSrcSet, getCardImageUrl } from "@/lib/images";

import { CardTypeBar } from "./card-type-bar";
import { DeckExportDialog } from "./deck-export-dialog";

function DomainIcon({ domain }: { domain: string }) {
  const lower = domain.toLowerCase();
  const ext = domain === COLORLESS_DOMAIN ? "svg" : "webp";
  return (
    <img src={`/images/domains/${lower}.${ext}`} alt={domain} title={domain} className="size-6" />
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
      <Swords className="text-muted-foreground/30 size-12" />
    </div>
  );
}

/**
 * Visual tile for a single deck in the deck grid.
 * @returns The deck tile element.
 */
export function DeckTile({ deck, cards }: { deck: DeckResponse; cards?: DeckCardResponse[] }) {
  const navigate = useNavigate();
  const cloneDeck = useCloneDeck();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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
  const updatedDate = new Date(deck.updatedAt).toLocaleDateString();
  const totalCards = cards
    ? cards.filter((card) => card.zone !== "overflow").reduce((sum, card) => sum + card.quantity, 0)
    : 0;

  const isValid =
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
          {/* Name + valid badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate leading-tight font-semibold">{deck.name}</h3>
              {(legend || champion) && (
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {[legend?.cardName, champion?.cardName].filter(Boolean).join(" / ")}
                </p>
              )}
            </div>
            {isValid && (
              <Badge
                variant="outline"
                className="shrink-0 border-green-600/30 bg-green-600/10 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400"
              >
                <Check className="size-3" />
                Valid
              </Badge>
            )}
          </div>

          {/* Domain icons + format */}
          <div className="flex items-center justify-between">
            {legendDomains && legendDomains.length > 0 ? (
              <span className="flex items-center gap-1">
                {legendDomains.map((domain) => (
                  <DomainIcon key={domain} domain={domain} />
                ))}
              </span>
            ) : (
              <span />
            )}
            <Badge variant="outline" className="text-xs capitalize">
              {deck.format}
            </Badge>
          </div>

          {/* Card type breakdown */}
          {cards && <CardTypeBar cards={cards} />}

          {/* Footer */}
          <div className="text-muted-foreground mt-auto flex items-center gap-3 pt-1 text-xs">
            <span>{updatedDate}</span>
            <span>{totalCards} cards</span>
            <span className="flex-1" />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" />}
                onClick={(event: React.MouseEvent) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(event: React.MouseEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setExportOpen(true);
                  }}
                >
                  <Share2 className="size-4" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClone}>
                  <Copy className="size-4" />
                  Clone
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDeleteClick}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4" />
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
