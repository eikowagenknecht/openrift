import { marketplaceLabel } from "@openrift/shared/marketplace";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";

import { MarketplaceIcon } from "@/components/marketplace-icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TIME_RANGES } from "@/features/cards/components/price-history-chart-constants";
import { percentChange } from "@/features/cards/lib/price-trend";
import {
  PRICE_SAMPLE_COUNT,
  chartDay,
  priceSeries,
  tickStep,
} from "@/features/marketing/lib/vignette-price-chart";
import { formatterForMarketplace, priceColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Vignette, VignetteHeading } from "./vignette-parts";

const PRICE_SOURCES = [
  { marketplace: "cardtrader", price: 3.65, phase: 0.6, swing: 0.9, rate: 0.02 },
  { marketplace: "tcgplayer", price: 4.52, phase: 2.2, swing: 1.4, rate: -0.014 },
  { marketplace: "cardmarket", price: 3.8, phase: 4.1, swing: 1.1, rate: 0.011 },
] as const;

type PriceSource = (typeof PRICE_SOURCES)[number];

// The real chart resolves `all`'s days:0 sentinel against the printing's span.
function priceRange(range: (typeof TIME_RANGES)[number]) {
  return { ...range, days: range.days === 0 ? 210 : range.days };
}

const PRICE_RANGES = TIME_RANGES.map((range) => priceRange(range));

type PriceRange = (typeof PRICE_RANGES)[number];

const PLOT = { left: 44, right: 296, top: 20, bottom: 92, step: 26 };

export function PricesVignette() {
  const [source, setSource] = useState<PriceSource>(PRICE_SOURCES[2]);
  const [range, setRange] = useState<PriceRange>(priceRange(TIME_RANGES[1]));

  const format = formatterForMarketplace(source.marketplace);
  const values = priceSeries(source, range.days);
  const step = tickStep(Math.min(...values), Math.max(...values));
  const topTick = Math.ceil(Math.max(...values) / step) * step;

  const points: [number, number][] = values.map((value, index) => [
    PLOT.left + (index / (PRICE_SAMPLE_COUNT - 1)) * (PLOT.right - PLOT.left),
    PLOT.top + ((topTick - value) / step) * PLOT.step,
  ]);
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${line} L${PLOT.right},${PLOT.bottom} L${PLOT.left},${PLOT.bottom} Z`;
  let length = 0;
  let previous: [number, number] | undefined;
  for (const [x, y] of points) {
    if (previous) {
      length += Math.hypot(x - previous[0], y - previous[1]);
    }
    previous = [x, y];
  }

  const pctChange = percentChange(values);
  const isUp = pctChange > 0;

  return (
    <Vignette>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">Azir, Sovereign</span>
        <span className="text-muted-foreground text-xs">SFD-177/221</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <VignetteHeading>Buy on</VignetteHeading>
        <div className="divide-border grid grid-cols-3 divide-x rounded-lg border">
          {PRICE_SOURCES.map((entry) => (
            <span key={entry.marketplace} className="flex flex-col items-center gap-1 px-2 py-2">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <MarketplaceIcon marketplace={entry.marketplace} />
                {marketplaceLabel(entry.marketplace)}
              </span>
              <span className={cn("font-semibold tabular-nums", priceColorClass(entry.price))}>
                {formatterForMarketplace(entry.marketplace)(entry.price)}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Time range"
          value={[range.value]}
          onValueChange={([next]) => {
            const match = PRICE_RANGES.find((entry) => entry.value === next);
            if (match) {
              setRange(match);
            }
          }}
        >
          {PRICE_RANGES.map((entry) => (
            <ToggleGroupItem key={entry.value} value={entry.value}>
              {entry.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
          {marketplaceLabel(source.marketplace)}
          {pctChange !== 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium tabular-nums",
                isUp ? "text-success" : "text-destructive",
              )}
            >
              {isUp ? (
                <TrendingUpIcon className="size-3" aria-hidden="true" />
              ) : (
                <TrendingDownIcon className="size-3" aria-hidden="true" />
              )}
              {Math.abs(pctChange)}%
            </span>
          )}
        </span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Price source"
          className="ml-auto"
          value={[source.marketplace]}
          onValueChange={([next]) => {
            const match = PRICE_SOURCES.find((entry) => entry.marketplace === next);
            if (match) {
              setSource(match);
            }
          }}
        >
          {PRICE_SOURCES.map((entry) => (
            <ToggleGroupItem
              key={entry.marketplace}
              value={entry.marketplace}
              aria-label={marketplaceLabel(entry.marketplace)}
            >
              <MarketplaceIcon marketplace={entry.marketplace} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <svg viewBox="0 0 300 110" className="w-full" role="img" aria-label="Price history">
        <defs>
          <linearGradient id="vignette-price-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <g stroke="var(--border)" strokeDasharray="3 3" strokeWidth="1">
          {[20, 46, 72, 92].map((y) => (
            <line key={y} x1="40" x2="300" y1={y} y2={y} />
          ))}
          {[113, 182, 251].map((x) => (
            <line key={x} x1={x} x2={x} y1="8" y2="92" />
          ))}
        </g>
        <path
          key={`${source.marketplace}-${range.value}-area`}
          d={area}
          fill="url(#vignette-price-fill)"
          className="motion-safe:animate-vignette-now"
        />
        <path
          key={`${source.marketplace}-${range.value}-line`}
          d={line}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeDasharray={length}
          className="motion-safe:animate-vignette-draw"
          style={{ "--vignette-draw-length": String(length) } as CSSProperties}
        />
        <g className="fill-muted-foreground" fontSize={7}>
          {[0, 1, 2].map((index) => (
            <text key={index} x="0" y={23 + index * PLOT.step}>
              {format(topTick - index * step)}
            </text>
          ))}
          {[range.days, Math.round(range.days / 2), 0].map((daysAgo, index) => (
            <text key={daysAgo} x={40 + index * 104} y="106">
              {chartDay(daysAgo)}
            </text>
          ))}
        </g>
      </svg>
    </Vignette>
  );
}
