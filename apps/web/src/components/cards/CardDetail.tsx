import type { Card } from "@openrift/shared";
import { useDrag } from "@use-gesture/react";
import { ArrowLeft, X } from "lucide-react";
import { useRef, useState } from "react";

import { FoilOverlay } from "@/components/cards/FoilOverlay";
import { Button } from "@/components/ui/button";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { requestGyroPermission, useFoilGyroscope } from "@/hooks/use-foil-gyroscope";
import { affiliateUrl } from "@/lib/affiliate";
import { getDomainGradientStyle, getDomainTintStyle } from "@/lib/domain";
import { formatPrice, formatPublicCode, priceColorClass } from "@/lib/format";
import { getTypeIconPath } from "@/lib/icons";
import { getCardImageUrl } from "@/lib/images";
import { IS_COARSE_POINTER } from "@/lib/pointer";
import { cn } from "@/lib/utils";

import { CardPlaceholderImage } from "./CardPlaceholderImage";
import { CardText } from "./CardText";

interface CardDetailProps {
  card: Card;
  onClose: () => void;
  showImages?: boolean;
  onPrevCard?: () => void;
  onNextCard?: () => void;
  onTagClick?: (tag: string) => void;
  onKeywordClick?: (keyword: string) => void;
}

export function CardDetail({
  card,
  onClose,
  showImages,
  onPrevCard,
  onNextCard,
  onTagClick,
  onKeywordClick,
}: CardDetailProps) {
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
      enabled: IS_COARSE_POINTER,
      filterTaps: true,
      axis: "lock",
    },
  );

  const hasFoil = Boolean(card.price?.foil);
  const isFoilOnly = hasFoil && !card.price?.normal;
  const [showFoil, setShowFoil] = useState(isFoilOnly);
  const [prevCardId, setPrevCardId] = useState(card.id);

  // Reset foil toggle when switching cards
  if (card.id !== prevCardId) {
    setPrevCardId(card.id);
    setShowFoil(isFoilOnly);
  }

  const gyro = useFoilGyroscope();

  const foilMode = IS_COARSE_POINTER
    ? gyro.available && gyro.permissionState === "granted"
      ? ("gyro" as const)
      : ("none" as const)
    : ("pointer" as const);

  const tilt = useCardTilt({ mode: foilMode, enabled: true, gyro });
  const showShimmer = IS_COARSE_POINTER && foilMode === "none";

  return (
    <aside
      ref={asideRef}
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto bg-background",
        "md:sticky md:inset-auto md:z-auto md:top-[4.5rem]",
        "md:w-[400px] md:shrink-0 md:max-h-[calc(100vh-4.5rem)]",
        "md:rounded-lg md:px-3",
      )}
      style={getDomainTintStyle(card.faction)}
    >
      {/* Mobile header */}
      <div className="sticky top-0 z-10 border-b border-border/30 p-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <ArrowLeft className="size-4" />
          </Button>
          <CardDetailHeading card={card} setNumber={setNumber} onTagClick={onTagClick} truncate />
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden md:flex md:items-start md:justify-between md:gap-2 md:pt-4 md:pb-4">
        <CardDetailHeading card={card} setNumber={setNumber} onTagClick={onTagClick} />
        <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-4 p-4 md:p-0 md:pb-4">
        {/* Card image — tap to toggle foil */}
        {hasFoil ? (
          <button
            type="button"
            ref={tilt.containerRef}
            style={tilt.style}
            onClick={() => {
              setShowFoil((prev) => {
                const next = !prev;
                if (
                  next &&
                  IS_COARSE_POINTER &&
                  gyro.available &&
                  gyro.permissionState === "prompt"
                ) {
                  requestGyroPermission();
                }
                return next;
              });
            }}
            className="w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left"
          >
            <CardImage
              innerRef={tilt.innerRef}
              card={card}
              showImages={showImages}
              showFoil={showFoil}
              tiltActive={tilt.active}
              showShimmer={showShimmer}
            />
          </button>
        ) : (
          <div ref={tilt.containerRef} style={tilt.style}>
            <CardImage
              innerRef={tilt.innerRef}
              card={card}
              showImages={showImages}
              showFoil={false}
              tiltActive={tilt.active}
              showShimmer={showShimmer}
            />
          </div>
        )}
        {/* Stats */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {card.stats.energy > 0 && <StatChip label="Energy" value={card.stats.energy} />}
          {(card.type === "Unit" || card.type === "Gear" || card.type === "Spell") &&
            card.stats.power > 0 && (
              <StatChip label="Power" value={card.stats.power} icon="/icons/power.svg" />
            )}
          {card.type === "Unit" && (
            <StatChip label="Might" value={card.stats.might} icon="/icons/might.svg" />
          )}
          {card.faction !== "Colorless" &&
            card.faction
              .split("/")
              .map((d) => (
                <img
                  key={d}
                  src={`/icons/domains/${d.toLowerCase()}.webp`}
                  alt={d}
                  title={d}
                  className="size-5"
                />
              ))}
          <img
            src={`/icons/rarities/${card.rarity.toLowerCase()}.webp`}
            alt={card.rarity}
            title={card.rarity}
            className="size-5"
          />
        </div>

        {/* Text */}
        <div className="space-y-3 pt-2">
          {card.description && (
            <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
              <p className="text-sm text-muted-foreground">
                <CardText text={card.description} onKeywordClick={onKeywordClick} />
              </p>
            </div>
          )}

          {(card.effect || (card.type === "Gear" && card.mightBonus > 0)) && (
            <div
              className="rounded-lg border border-border/50 px-3 py-2.5"
              style={getDomainGradientStyle(card.faction, "18")}
            >
              {card.effect && (
                <p className="text-sm text-muted-foreground">
                  <CardText text={card.effect} onKeywordClick={onKeywordClick} />
                </p>
              )}
              {card.type === "Gear" && card.mightBonus > 0 && (
                <div className={cn(card.effect && "mt-2")}>
                  <StatChip
                    label="Might Bonus"
                    value={`+${card.mightBonus}`}
                    icon="/icons/might.svg"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <img src="/icons/artist.svg" alt="" className="size-3.5 brightness-0 dark:invert" />
            {card.art.artist}
          </p>
          {card.price && <PricingSection card={card} />}
        </div>
      </div>
    </aside>
  );
}

function CardImage({
  innerRef,
  card,
  showImages,
  showFoil,
  tiltActive,
  showShimmer,
}: {
  innerRef: React.RefCallback<HTMLElement>;
  card: Card;
  showImages?: boolean;
  showFoil: boolean;
  tiltActive: boolean;
  showShimmer: boolean;
}) {
  return (
    <div
      ref={innerRef}
      className="relative overflow-hidden"
      style={{
        // Percentage border-radius creates elliptical corners on non-square
        // elements. Use the / syntax to keep corners circular: horizontal
        // radius is 5% of width, vertical is scaled by the card aspect
        // ratio (744/1039) so both resolve to the same pixel value.
        // 5% covers the range of built-in artwork corner radii (~3.9-4.7%).
        borderRadius: "5% / 3.6%",
        transform:
          "perspective(1000px) rotateX(var(--foil-rotate-x, 0deg)) rotateY(var(--foil-rotate-y, 0deg))",
        transformStyle: "preserve-3d",
      }}
    >
      {showImages && card.art.fullURL ? (
        <img
          src={getCardImageUrl(card.art.fullURL, "full", card.orientation)}
          alt={card.name}
          className="block w-full"
        />
      ) : (
        <CardPlaceholderImage
          name={card.name}
          domain={card.faction}
          energy={card.stats.energy}
          might={card.stats.might}
        />
      )}
      {showFoil && <FoilOverlay active={tiltActive} shimmer={showShimmer} />}
    </div>
  );
}

function CardDetailHeading({
  card,
  setNumber,
  onTagClick,
  truncate,
}: {
  card: Card;
  setNumber: string;
  onTagClick?: (tag: string) => void;
  truncate?: boolean;
}) {
  return (
    <div className={cn(truncate && "min-w-0")}>
      <h2 className={cn("text-lg font-semibold", truncate && "truncate")}>
        {card.name}
        <span className="ml-2 text-sm font-normal text-muted-foreground">{setNumber}</span>
      </h2>
      <div className="flex flex-wrap items-center gap-1.5 text-sm uppercase text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <img
            src={getTypeIconPath(card.type, card.superTypes)}
            alt=""
            className="size-4 brightness-0 dark:invert"
          />
          {card.superTypes.length > 0 ? `${card.superTypes.join(" ")} ${card.type}` : card.type}
        </span>
        {card.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="relative inline-flex cursor-pointer items-center px-0.5 py-0.5"
            onClick={() => onTagClick?.(tag)}
          >
            <span className="absolute inset-0 -skew-x-[15deg] bg-black dark:bg-white" />
            <span className="relative text-xs font-semibold uppercase italic tracking-wide scale-x-75 text-white dark:text-black">
              {tag}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: string;
}) {
  return (
    <span
      title={label}
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-sm font-semibold"
    >
      {icon && <img src={icon} alt="" className="size-3.5 brightness-0 dark:invert" />}
      <span className="text-xs font-normal text-muted-foreground">{label}</span>
      {value}
    </span>
  );
}

function PriceChip({ label, value, url }: { label: string; value: number; url: string | null }) {
  const Wrapper = url ? "a" : "span";
  const linkProps = url ? { href: url, target: "_blank" as const, rel: "noopener noreferrer" } : {};

  return (
    <Wrapper
      {...linkProps}
      className={cn(
        `inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-sm font-semibold ${priceColorClass(value)}`,
        url && "transition-opacity hover:opacity-70",
      )}
    >
      <span className="text-xs font-normal text-muted-foreground">{label}</span>
      {formatPrice(value)}
    </Wrapper>
  );
}

function PricingSection({ card }: { card: Card }) {
  const price = card.price;
  if (!price) {
    return null;
  }

  const url = price.url ? affiliateUrl(price.url) : null;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="inline-flex items-center gap-1.5">
        {price.normal && <PriceChip label="Normal" value={price.normal.market} url={url} />}
        {price.foil && <PriceChip label="Foil" value={price.foil.market} url={url} />}
      </div>
      <a
        href="https://www.tcgplayer.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        Prices via TCGplayer ↗
      </a>
    </div>
  );
}
