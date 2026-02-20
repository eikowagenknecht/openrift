import type { Card } from "@openrift/shared";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatPublicCode } from "@/lib/format";

import { CardPlaceholderImage } from "./CardPlaceholderImage";
import { CardText } from "./CardText";

interface CardDetailProps {
  card: Card | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showImages?: boolean;
}

export function CardDetail({ card, open, onOpenChange, showImages }: CardDetailProps) {
  if (!card) {
    return null;
  }

  const setNumber = formatPublicCode(card);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{card.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <img src={`/icons/types/${card.type.toLowerCase()}.svg`} alt="" className="size-4" />
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
                      className="size-4"
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
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
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
              cost={card.stats.cost}
              might={card.stats.might}
            />
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-muted p-3 text-center">
              <p className="text-xs text-muted-foreground">Energy</p>
              <p className="text-2xl font-bold">{card.stats.energy}</p>
            </div>
            {card.type === "Gear" ? (
              <>
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground">Might Bonus</p>
                  <p className="flex items-center justify-center gap-1 text-2xl font-bold">
                    <img
                      src="/icons/might.svg"
                      alt=""
                      className="size-5 brightness-0 dark:invert"
                    />
                    +{card.mightBonus}
                  </p>
                </div>
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground">Power</p>
                  <p className="flex items-center justify-center gap-1 text-2xl font-bold">
                    <img
                      src="/icons/power.svg"
                      alt=""
                      className="size-5 brightness-0 dark:invert"
                    />
                    {card.stats.power}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground">Might</p>
                  <p className="flex items-center justify-center gap-1 text-2xl font-bold">
                    <img
                      src="/icons/might.svg"
                      alt=""
                      className="size-5 brightness-0 dark:invert"
                    />
                    {card.stats.might}
                  </p>
                </div>
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground">Power</p>
                  <p className="flex items-center justify-center gap-1 text-2xl font-bold">
                    <img
                      src="/icons/power.svg"
                      alt=""
                      className="size-5 brightness-0 dark:invert"
                    />
                    {card.stats.power}
                  </p>
                </div>
              </>
            )}
          </div>

          {card.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {card.keywords.map((keyword) => (
                <Badge key={keyword} variant="secondary">
                  {keyword}
                </Badge>
              ))}
            </div>
          )}

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

          {card.flavorText && (
            <div>
              <p className="text-sm italic text-muted-foreground">
                &ldquo;
                <CardText text={card.flavorText} />
                &rdquo;
              </p>
            </div>
          )}

          <Separator />

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
      </SheetContent>
    </Sheet>
  );
}
