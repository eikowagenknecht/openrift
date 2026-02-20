import type { Card } from "@openrift/shared";
import { ArrowLeft, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatPublicCode } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CardPlaceholderImage } from "./CardPlaceholderImage";
import { CardText } from "./CardText";

interface CardDetailProps {
  card: Card;
  onClose: () => void;
  showImages?: boolean;
}

export function CardDetail({ card, onClose, showImages }: CardDetailProps) {
  const setNumber = formatPublicCode(card);

  return (
    <aside
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto bg-background",
        "md:sticky md:inset-auto md:z-auto md:top-[4.5rem]",
        "md:w-[400px] md:shrink-0 md:max-h-[calc(100vh-4.5rem)]",
        "md:border-l md:pl-6",
      )}
    >
      {/* Mobile header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 p-4 backdrop-blur md:hidden">
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="truncate text-lg font-semibold">{card.name}</h2>
      </div>

      {/* Desktop header */}
      <div className="hidden md:flex md:items-start md:justify-between md:gap-2 md:pb-4">
        <h2 className="text-lg font-semibold">{card.name}</h2>
        <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-4 p-4 md:p-0 md:pb-4">
        {/* Type / Supertype / Rarity / Domain */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <img
              src={`/icons/types/${card.type.toLowerCase()}.svg`}
              alt=""
              className="size-4 brightness-0 dark:invert"
            />
            {card.type}
          </span>
          {card.superTypes.length > 0 && (
            <>
              &middot;
              <span className="inline-flex items-center gap-1">
                {card.superTypes.map((st) => (
                  <img
                    key={st}
                    src={`/icons/supertypes/${st.toLowerCase()}.svg`}
                    alt=""
                    className="size-4 brightness-0 dark:invert"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ))}
                {card.superTypes.join(", ")}
              </span>
            </>
          )}
          &middot;
          <span className="inline-flex items-center gap-1">
            <img
              src={`/icons/rarities/${card.rarity.toLowerCase()}.webp`}
              alt=""
              className="size-4"
            />
            {card.rarity}
          </span>
          &middot;
          <span className="inline-flex items-center gap-1">
            {card.faction !== "Colorless" &&
              card.faction
                .split("/")
                .map((d) => (
                  <img
                    key={d}
                    src={`/icons/domains/${d.toLowerCase()}.webp`}
                    alt=""
                    className="size-4"
                  />
                ))}
            {card.faction === "Colorless" ? "No Domain" : card.faction.replace("/", " / ")}
          </span>
        </div>

        {/* Card image */}
        {showImages && card.art.fullURL ? (
          <img
            src={`${card.art.fullURL}?fm=webp${card.orientation === "landscape" ? "&or=270" : ""}`}
            alt={card.name}
            className="w-full rounded-lg"
          />
        ) : (
          <CardPlaceholderImage
            name={card.name}
            domain={card.faction}
            energy={card.stats.energy}
            might={card.stats.might}
          />
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-muted p-3 text-center">
            <p className="text-xs text-muted-foreground">Energy</p>
            <p className="text-2xl font-bold">{card.stats.energy}</p>
          </div>
          {card.type === "Gear" && (
            <div className="rounded-md bg-muted p-3 text-center">
              <p className="text-xs text-muted-foreground">Might Bonus</p>
              <p className="flex items-center justify-center gap-1 text-2xl font-bold">
                <img src="/icons/might.svg" alt="" className="size-5 brightness-0 dark:invert" />+
                {card.mightBonus}
              </p>
            </div>
          )}
          {card.type === "Unit" && (
            <div className="rounded-md bg-muted p-3 text-center">
              <p className="text-xs text-muted-foreground">Might</p>
              <p className="flex items-center justify-center gap-1 text-2xl font-bold">
                <img src="/icons/might.svg" alt="" className="size-5 brightness-0 dark:invert" />
                {card.stats.might}
              </p>
            </div>
          )}
          {(card.type === "Unit" || card.type === "Gear" || card.type === "Spell") && (
            <div className="rounded-md bg-muted p-3 text-center">
              <p className="text-xs text-muted-foreground">Power</p>
              <p className="flex items-center justify-center gap-1 text-2xl font-bold">
                <img src="/icons/power.svg" alt="" className="size-5 brightness-0 dark:invert" />
                {card.stats.power}
              </p>
            </div>
          )}
        </div>

        {/* Keywords */}
        {card.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {card.keywords.map((keyword) => (
              <Badge key={keyword} variant="secondary">
                {keyword}
              </Badge>
            ))}
          </div>
        )}

        {/* Tags */}
        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {card.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <Separator />

        {/* Text */}
        <div>
          <p className="mb-1 text-sm font-medium">Description</p>
          <p className="text-sm text-muted-foreground">
            <CardText text={card.description} />
          </p>
        </div>

        {card.effect && (
          <div>
            <p className="mb-1 text-sm font-medium">Effect</p>
            <p className="text-sm text-muted-foreground">
              <CardText text={card.effect} />
            </p>
          </div>
        )}

        <Separator />

        {/* Footer */}
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            {setNumber} · {card.set}
          </p>
          <p className="flex items-center gap-1">
            <img src="/icons/artist.svg" alt="" className="size-3.5 brightness-0 dark:invert" />
            {card.art.artist}
          </p>
        </div>
      </div>
    </aside>
  );
}
