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
              <img src={`/icons/domains/${card.domain}.webp`} alt="" className="size-4" />
              {card.domain}
            </span>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <CardPlaceholderImage
            name={card.name}
            rarity={card.rarity}
            type={card.type}
            domain={card.domain}
            cost={card.cost}
            attack={card.stats?.attack}
          />

          {card.stats && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-muted p-3 text-center">
                <p className="text-xs text-muted-foreground">Attack</p>
                <p className="text-2xl font-bold">{card.stats.attack}</p>
              </div>
              <div className="rounded-md bg-muted p-3 text-center">
                <p className="text-xs text-muted-foreground">Health</p>
                <p className="text-2xl font-bold">{card.stats.health}</p>
              </div>
            </div>
          )}

          <div className="rounded-md bg-muted p-3 text-center">
            <p className="text-xs text-muted-foreground">Cost</p>
            <p className="text-2xl font-bold">{card.cost}</p>
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
            <p>Set: {card.set}</p>
            <p>Collector #{card.collectorNumber}</p>
            <p>Artist: {card.artist}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
