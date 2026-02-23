import type { Card } from "@openrift/shared";
import { useDrag } from "@use-gesture/react";
import { ArrowLeft, X } from "lucide-react";
import { useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDomainDisplay, getDomainTintStyle } from "@/lib/domain";
import { formatPrice, formatPublicCode } from "@/lib/format";
import { getCardImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

import { CardPlaceholderImage } from "./CardPlaceholderImage";
import { CardText } from "./CardText";

interface CardDetailProps {
  card: Card;
  onClose: () => void;
  showImages?: boolean;
  onPrevCard?: () => void;
  onNextCard?: () => void;
}

export function CardDetail({ card, onClose, showImages, onPrevCard, onNextCard }: CardDetailProps) {
  const setNumber = formatPublicCode(card);
  const asideRef = useRef<HTMLElement>(null);

  useDrag(
    ({ last, movement: [dx, dy], swipe: [swipeX] }) => {
      if (!last) {
        return;
      }
      // swipe detected by the library (velocity-based)
      if (swipeX === 1 && onPrevCard) {
        onPrevCard();
      } else if (swipeX === -1 && onNextCard) {
        onNextCard();
      } else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        // fallback: distance-based threshold
        if (dx > 0 && onPrevCard) {
          onPrevCard();
        } else if (dx < 0 && onNextCard) {
          onNextCard();
        }
      }
    },
    {
      target: asideRef,
      pointer: { touch: true },
      filterTaps: true,
      axis: "lock",
    },
  );

  return (
    <aside
      ref={asideRef}
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto bg-background",
        "md:sticky md:inset-auto md:z-auto md:top-[6.5rem]",
        "md:w-[400px] md:shrink-0 md:max-h-[calc(100vh-6.5rem)]",
        "md:border-l md:px-6",
      )}
      style={getDomainTintStyle(card.faction)}
    >
      {/* Mobile header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 p-4 backdrop-blur md:hidden">
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="truncate text-lg font-semibold">{card.name}</h2>
      </div>

      {/* Desktop header */}
      <div className="hidden md:flex md:items-start md:justify-between md:gap-2 md:pt-4 md:pb-4">
        <h2 className="text-lg font-semibold">{card.name}</h2>
        <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-4 p-4 md:p-0 md:pb-4">
        {/* Pricing */}
        {card.price && <PricingSection card={card} />}

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
            {formatDomainDisplay(card.faction)}
          </span>
        </div>

        {/* Card image */}
        {showImages && card.art.fullURL ? (
          <img
            src={getCardImageUrl(card.art.fullURL, "full", card.orientation)}
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
        <div className="grid grid-cols-3 gap-2">
          {card.stats.energy > 0 && <StatCard label="Energy" value={card.stats.energy} />}
          {(card.type === "Unit" || card.type === "Gear" || card.type === "Spell") &&
            card.stats.power > 0 && (
              <StatCard label="Power" value={card.stats.power} icon="/icons/power.svg" />
            )}
          {card.type === "Unit" && (
            <StatCard label="Might" value={card.stats.might} icon="/icons/might.svg" />
          )}
          {card.type === "Gear" && card.mightBonus > 0 && (
            <StatCard label="Might Bonus" value={`+${card.mightBonus}`} icon="/icons/might.svg" />
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

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: string;
}) {
  return (
    <div className="rounded-md bg-muted p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="flex items-center justify-center gap-1 text-2xl font-bold">
        {icon && <img src={icon} alt="" className="size-5 brightness-0 dark:invert" />}
        {value}
      </p>
    </div>
  );
}

function PricingSection({ card }: { card: Card }) {
  const price = card.price;
  if (!price) {
    return null;
  }
  const hasBoth = price.normal && price.foil;

  const Wrapper = price.url ? "a" : "div";
  const linkProps = price.url
    ? { href: price.url, target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <Wrapper
      {...linkProps}
      className={cn(
        "grid gap-4 rounded-md bg-muted p-3",
        hasBoth ? "grid-cols-2" : "grid-cols-1",
        price.url && "transition-colors hover:bg-muted/70",
      )}
    >
      {price.normal && (
        <div className="flex items-baseline gap-2">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {formatPrice(price.normal.market)}
          </p>
          <p className="text-[10px] uppercase text-muted-foreground">Normal</p>
        </div>
      )}
      {price.foil && (
        <div className="flex items-baseline gap-2">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {formatPrice(price.foil.market)}
          </p>
          <p className="text-[10px] uppercase text-muted-foreground">Foil</p>
        </div>
      )}
    </Wrapper>
  );
}
