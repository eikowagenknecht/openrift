import type { Card, CardPrice, TimeRange } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";
import { useDrag } from "@use-gesture/react";
import { ArrowLeft, TrendingDown, TrendingUp, TriangleAlert, X } from "lucide-react";
import { useRef, useState } from "react";

import { FoilOverlay } from "@/components/cards/foil-overlay";
import { PriceSparkline } from "@/components/cards/price-sparkline";
import { Button } from "@/components/ui/button";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { useFoilGyroscope } from "@/hooks/use-foil-gyroscope";
import { usePriceHistory } from "@/hooks/use-price-history";
import { affiliateUrl } from "@/lib/affiliate";
import { getDomainGradientStyle, getDomainTintStyle } from "@/lib/domain";
import {
  formatCardId,
  formatPrice,
  formatPriceEur,
  formatPrintingLabel,
  formatPublicCode,
  priceColorClass,
} from "@/lib/format";
import { getTypeIconPath } from "@/lib/icons";
import { getCardImageUrl } from "@/lib/images";
import { IS_COARSE_POINTER } from "@/lib/pointer";
import { cn } from "@/lib/utils";

import { CardPlaceholderImage } from "./card-placeholder-image";
import { CardText } from "./card-text";

interface CardDetailProps {
  card: Card;
  onClose: () => void;
  showImages?: boolean;
  onPrevCard?: () => void;
  onNextCard?: () => void;
  onTagClick?: (tag: string) => void;
  onKeywordClick?: (keyword: string) => void;
  printings?: Card[];
  onSelectPrinting?: (card: Card) => void;
}

export function CardDetail({
  card,
  onClose,
  showImages,
  onPrevCard,
  onNextCard,
  onTagClick,
  onKeywordClick,
  printings,
  onSelectPrinting,
}: CardDetailProps) {
  const setNumber = formatPublicCode(card);
  const asideRef = useRef<HTMLElement>(null);
  const orientation = getOrientation(card.type);
  const isFoil = card.finish === "foil";

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

  const gyro = useFoilGyroscope();

  const foilMode = IS_COARSE_POINTER
    ? gyro.available && gyro.permissionState === "granted"
      ? ("gyro" as const)
      : ("none" as const)
    : ("pointer" as const);

  const tilt = useCardTilt({ mode: foilMode, enabled: !IS_COARSE_POINTER || isFoil, gyro });
  const showShimmer = IS_COARSE_POINTER && foilMode === "none";

  return (
    <aside
      ref={asideRef}
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto bg-background",
        "md:sticky md:inset-auto md:z-auto md:top-(--sticky-top)",
        "md:w-[400px] md:shrink-0 md:max-h-[calc(100vh-var(--sticky-top))]",
        "md:rounded-lg md:px-3",
      )}
      style={getDomainTintStyle(card.domains)}
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
        {/* Card image */}
        <div ref={tilt.containerRef} style={tilt.style}>
          <CardImage
            innerRef={tilt.innerRef}
            card={card}
            orientation={orientation}
            showImages={showImages}
            showFoil={isFoil}
            tiltActive={tilt.active}
            showShimmer={showShimmer}
          />
        </div>
        {/* Stats */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {card.stats.energy !== null && card.stats.energy > 0 && (
            <StatChip label="Energy" value={card.stats.energy} />
          )}
          {card.stats.power !== null && card.stats.power > 0 && (
            <StatChip label="Power" value={card.stats.power} icon="/images/power.svg" />
          )}
          {card.stats.might !== null && (
            <StatChip label="Might" value={card.stats.might} icon="/images/might.svg" />
          )}
          {!card.domains.includes("Colorless") &&
            card.domains.map((d) => (
              <img
                key={d}
                src={`/images/domains/${d.toLowerCase()}.webp`}
                alt={d}
                title={d}
                width={64}
                height={64}
                className="size-5"
              />
            ))}
          <img
            src={`/images/rarities/${card.rarity.toLowerCase()}-28x28.webp`}
            alt={card.rarity}
            title={card.rarity}
            width={28}
            height={28}
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
              {card.printedDescription && <PrintedTextWarning />}
            </div>
          )}

          {(card.effect || (card.mightBonus !== null && card.mightBonus > 0)) && (
            <div
              className="rounded-lg border border-border/50 px-3 py-2.5"
              style={getDomainGradientStyle(card.domains, "18")}
            >
              {card.effect && (
                <p className="text-sm text-muted-foreground">
                  <CardText text={card.effect} onKeywordClick={onKeywordClick} />
                </p>
              )}
              {card.printedEffect && <PrintedTextWarning />}
              {card.mightBonus !== null && card.mightBonus > 0 && (
                <div className={cn(card.effect && "mt-2")}>
                  <StatChip
                    label="Might Bonus"
                    value={`+${card.mightBonus}`}
                    icon="/images/might.svg"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <CardFooter card={card} />

        {/* Versions */}
        {printings && printings.length > 1 && onSelectPrinting && (
          <PrintingPicker current={card} printings={printings} onSelect={onSelectPrinting} />
        )}
      </div>
    </aside>
  );
}

function CardFooter({ card }: { card: Card }) {
  const [priceRange, setPriceRange] = useState<TimeRange>("30d");

  return (
    <div className="mt-2 space-y-2">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <img src="/images/artist.svg" alt="" className="size-3.5 brightness-0 dark:invert" />
        {card.art.artist}
      </p>
      <PricingSection card={card} range={priceRange} />
      {card.price && <PriceSparkline printingId={card.id} onRangeChange={setPriceRange} />}
    </div>
  );
}

function CardImage({
  innerRef,
  card,
  orientation,
  showImages,
  showFoil,
  tiltActive,
  showShimmer,
}: {
  innerRef: React.RefCallback<HTMLElement>;
  card: Card;
  orientation: "portrait" | "landscape";
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
      {showImages && card.art.imageURL ? (
        <img
          src={getCardImageUrl(card.art.imageURL, "full", orientation)}
          alt={card.name}
          className="block w-full"
        />
      ) : (
        <CardPlaceholderImage
          name={card.name}
          domain={card.domains}
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

function PricingSection({ card, range }: { card: Card; range: TimeRange }) {
  const price = card.price;
  const { data: history } = usePriceHistory(card.id, range);
  const cmSnapshots = history?.cardmarket.snapshots;
  const cmLatest = cmSnapshots?.length ? cmSnapshots.at(-1) : null;

  if (!price && !cmLatest) {
    return null;
  }

  const tcgProductId = price?.productId ?? history?.tcgplayer.productId;
  const tcgUrl = tcgProductId
    ? affiliateUrl(`https://www.tcgplayer.com/product/${tcgProductId}`)
    : null;
  const cmProductId = history?.cardmarket.productId;
  const cmUrl = cmProductId
    ? `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${cmProductId}`
    : null;

  return (
    <div className="flex items-center justify-end gap-1.5">
      {price && (
        <>
          <PriceTrend printingId={card.id} range={range} />
          <PriceChip
            label="TCGplayer"
            icon="/images/external/tcgplayer-38x28.webp"
            iconClassName="invert dark:invert-0"
            value={price.market}
            url={tcgUrl}
          />
        </>
      )}
      {cmLatest && (
        <PriceChip
          label="Cardmarket"
          icon="/images/external/cardmarket-20x28.webp"
          iconClassName="invert dark:invert-0"
          value={cmLatest.market}
          url={cmUrl}
          formatValue={formatPriceEur}
        />
      )}
    </div>
  );
}

const RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "all time",
};

function PriceTrend({ printingId, range = "30d" }: { printingId: string; range?: TimeRange }) {
  const { data } = usePriceHistory(printingId, range);
  const snapshots = data?.tcgplayer.snapshots;
  if (!snapshots || snapshots.length < 2) {
    return null;
  }

  const first = snapshots[0].market;
  // oxlint-disable-next-line no-non-null-assertion -- length >= 2 is checked above
  const last = snapshots.at(-1)!.market;
  if (first === 0) {
    return null;
  }

  const pctChange = ((last - first) / first) * 100;
  const rounded = Math.round(pctChange);

  if (rounded === 0) {
    return null;
  }

  const isUp = rounded > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
      title={`${isUp ? "+" : ""}${rounded}% over ${RANGE_LABELS[range]}`}
    >
      {isUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {Math.abs(rounded)}%
    </span>
  );
}

function PriceChip({
  label,
  icon,
  value,
  url,
  formatValue = formatPrice,
  iconClassName,
}: {
  label: string;
  icon?: string;
  value: number;
  url: string | null;
  formatValue?: (v: number) => string;
  iconClassName?: string;
}) {
  const Wrapper = url ? "a" : "span";
  const linkProps = url ? { href: url, target: "_blank" as const, rel: "noopener noreferrer" } : {};

  return (
    <Wrapper
      {...linkProps}
      title={label}
      className={cn(
        `inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-sm font-semibold ${priceColorClass(value)}`,
        url && "transition-opacity hover:opacity-70",
      )}
    >
      {icon ? (
        <img src={icon} alt={label} className={cn("h-3", iconClassName)} />
      ) : (
        <span className="text-xs font-normal text-muted-foreground">{label}</span>
      )}
      {formatValue(value)}
    </Wrapper>
  );
}

function PrintedTextWarning() {
  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground/70">
      <TriangleAlert className="size-3 shrink-0" />
      Printed text on this card differs from the current rules.
    </p>
  );
}

function PrintingPicker({
  current,
  printings,
  onSelect,
}: {
  current: Card;
  printings: Card[];
  onSelect: (card: Card) => void;
}) {
  const hasMixedRarities = new Set(printings.map((p) => p.rarity)).size > 1;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Versions
      </h3>
      <div className="space-y-1">
        {printings.map((p) => {
          const isActive = p.id === current.id;
          const label = formatPrintingLabel(p, printings);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                isActive ? "bg-muted ring-1 ring-border" : "hover:bg-muted/50",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                  {formatCardId(p)}
                </span>
                {label}
                {hasMixedRarities && (
                  <img
                    src={`/images/rarities/${p.rarity.toLowerCase()}-28x28.webp`}
                    alt={p.rarity}
                    title={p.rarity}
                    width={28}
                    height={28}
                    className="ml-1 inline size-3.5 align-text-bottom"
                  />
                )}
              </span>
              <PrintingPrices price={p.price} printingId={p.id} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PrintingPrices({
  price,
  printingId,
}: {
  price: CardPrice | undefined;
  printingId: string;
}) {
  const { data: history } = usePriceHistory(printingId, "30d");
  const cmSnapshots = history?.cardmarket.snapshots;
  const cmLatest = cmSnapshots?.length ? cmSnapshots.at(-1) : null;

  if (!price && !cmLatest) {
    return null;
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {price && (
        <span className={cn("text-xs font-semibold", priceColorClass(price.market))}>
          {formatPrice(price.market)}
        </span>
      )}
      {cmLatest && (
        <span className={cn("text-xs font-semibold", priceColorClass(cmLatest.market))}>
          {formatPriceEur(cmLatest.market)}
        </span>
      )}
    </span>
  );
}
