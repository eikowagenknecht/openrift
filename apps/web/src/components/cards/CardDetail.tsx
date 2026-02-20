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
import { formatCollectorNumber } from "@/lib/format";

import { CardPlaceholderImage } from "./CardPlaceholderImage";

interface CardDetailProps {
  card: Card | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CardDetail({ card, open, onOpenChange }: CardDetailProps) {
  if (!card) {
    return null;
  }

  const setNumber = formatCollectorNumber(card);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{card.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <img src={`/icons/types/${card.type.toLowerCase()}.webp`} alt="" className="size-4" />
              {card.type}
            </span>
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
              {card.faction.split("/").map((d) => (
                <img key={d} src={`/icons/domains/${d}.webp`} alt="" className="size-4" />
              ))}
              {card.faction.replace("/", " / ")}
            </span>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <CardPlaceholderImage
            name={card.name}
            rarity={card.rarity}
            type={card.type}
            domain={card.faction}
            cost={card.stats.cost}
            might={card.stats.might}
            setNumber={setNumber}
          />

          {(card.stats.might > 0 || card.stats.energy > 0) && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-muted p-3 text-center">
                <p className="text-xs text-muted-foreground">Might</p>
                <p className="text-2xl font-bold">{card.stats.might}</p>
              </div>
              <div className="rounded-md bg-muted p-3 text-center">
                <p className="text-xs text-muted-foreground">Energy</p>
                <p className="text-2xl font-bold">{card.stats.energy}</p>
              </div>
            </div>
          )}

          <div className="rounded-md bg-muted p-3 text-center">
            <p className="text-xs text-muted-foreground">Cost</p>
            <p className="text-2xl font-bold">{card.stats.cost}</p>
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

          <Separator />

          <div>
            <p className="mb-1 text-sm font-medium">Description</p>
            <p className="text-sm text-muted-foreground">{card.description}</p>
          </div>

          {card.flavorText && (
            <div>
              <p className="text-sm italic text-muted-foreground">
                &ldquo;{card.flavorText}&rdquo;
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              {setNumber} &middot; {card.set}
            </p>
            <p>Artist: {card.art.artist}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
