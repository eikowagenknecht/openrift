import type { Card } from "@openrift/shared";
import { useDrag } from "@use-gesture/react";
import { ArrowLeft, X } from "lucide-react";
import { useRef } from "react";

import { FoilOverlay } from "@/components/cards/FoilOverlay";
import { Button } from "@/components/ui/button";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { requestGyroPermission, useFoilGyroscope } from "@/hooks/use-foil-gyroscope";
import { formatDomainDisplay, getDomainTintStyle } from "@/lib/domain";
import { formatPrice, formatPublicCode } from "@/lib/format";
import { getCardImageUrl } from "@/lib/images";
import { IS_COARSE_POINTER } from "@/lib/pointer";
import { cn } from "@/lib/utils";

import { CardPlaceholderImage } from "./CardPlaceholderImage";
import { CardText } from "./CardText";

const KEYWORD_COLORS: Record<string, string> = {
  Accelerate: "#24705f",
  Action: "#24705f",
  Assault: "#cd346f",
  Deathknell: "#95b229",
  Deflect: "#95b229",
  Equip: "#707070",
  Ganking: "#95b229",
  Hidden: "#24705f",
  Legion: "#24705f",
  Mighty: "#707070",
  "Quick-Draw": "#24705f",
  Reaction: "#24705f",
  Repeat: "#24705f",
  Shield: "#cd346f",
  Tank: "#cd346f",
  Temporary: "#95b229",
  Unique: "#24705f",
  Vision: "#707070",
  Weaponmaster: "#707070",
};

const KEYWORD_DARK_TEXT = new Set(["Deathknell", "Deflect", "Ganking", "Temporary"]);

function getKeywordStyle(keyword: string): { bg: string; dark: boolean } {
  // Strip trailing numbers (e.g. "Shield 2" → "Shield")
  const base = keyword.replace(/\s+\d+$/, "");
  return {
    bg: KEYWORD_COLORS[base] ?? "#6a6a6a",
    dark: KEYWORD_DARK_TEXT.has(base),
  };
}

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
      pointer: { touch: true },
      filterTaps: true,
      axis: "lock",
    },
  );

  const isFoilCard = Boolean(card.price?.foil) && !card.price?.normal;
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
        "md:border-l md:px-6",
      )}
      style={getDomainTintStyle(card.faction)}
    >
      {/* Mobile header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/30 p-4 backdrop-blur md:hidden">
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          <span className="truncate">{card.name}</span>
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
        </h2>
      </div>

      {/* Desktop header */}
      <div className="hidden md:flex md:items-start md:justify-between md:gap-2 md:pt-4 md:pb-4">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {card.name}
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
        </h2>
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
        <div ref={tilt.containerRef} style={tilt.style}>
          <div
            ref={tilt.innerRef}
            className="relative overflow-hidden"
            style={{
              // Percentage border-radius creates elliptical corners on non-square
              // elements. Use the / syntax to keep corners circular: horizontal
              // radius is 5% of width, vertical is scaled by the card aspect
              // ratio (744/1039) so both resolve to the same pixel value.
              // 5% covers the range of built-in artwork corner radii (~3.9-4.7%).
              borderRadius: "5% / 3.6%",
              transform:
                "perspective(800px) rotateX(var(--foil-rotate-x, 0deg)) rotateY(var(--foil-rotate-y, 0deg))",
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
            {isFoilCard && <FoilOverlay active={tilt.active} shimmer={showShimmer} />}
          </div>
        </div>
        {isFoilCard && IS_COARSE_POINTER && gyro.available && gyro.permissionState === "prompt" && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => requestGyroPermission()}
          >
            Enable tilt effect
          </button>
        )}

        {/* Stats */}
        <div className="flex flex-wrap gap-1.5">
          {card.stats.energy > 0 && <StatChip label="Energy" value={card.stats.energy} />}
          {(card.type === "Unit" || card.type === "Gear" || card.type === "Spell") &&
            card.stats.power > 0 && (
              <StatChip label="Power" value={card.stats.power} icon="/icons/power.svg" />
            )}
          {card.type === "Unit" && (
            <StatChip label="Might" value={card.stats.might} icon="/icons/might.svg" />
          )}
          {card.type === "Gear" && card.mightBonus > 0 && (
            <StatChip label="Might Bonus" value={`+${card.mightBonus}`} icon="/icons/might.svg" />
          )}
        </div>

        {/* Keywords */}
        {card.keywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {card.keywords.map((keyword) => {
              const kw = getKeywordStyle(keyword);
              return (
                <button
                  key={keyword}
                  type="button"
                  className="relative inline-flex cursor-pointer items-center px-0.5 py-0.5"
                  onClick={() => onKeywordClick?.(keyword)}
                >
                  <span
                    className="absolute inset-0 -skew-x-[15deg]"
                    style={{ backgroundColor: kw.bg }}
                  />
                  <span
                    className={cn(
                      "relative text-xs font-semibold uppercase italic tracking-wide scale-x-75",
                      kw.dark ? "text-black" : "text-white",
                    )}
                  >
                    {keyword}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Text */}
        <div className="pt-2">
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

        {/* Footer */}
        <div className="-mx-4 mt-2 rounded-lg bg-muted/50 px-4 py-3 md:-mx-0">
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
      </div>
    </aside>
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
