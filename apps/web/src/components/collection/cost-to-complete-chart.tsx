import { imageUrl } from "@openrift/shared/image-url";
import { getPlaysetSize } from "@openrift/shared/playset";
import type { CompletionScopePreference } from "@openrift/shared/types/api/preferences";
import type { PriceLookup } from "@openrift/shared/types/api/pricing";
import type { Printing } from "@openrift/shared/types/catalog";
import type { CardType } from "@openrift/shared/types/enums";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { legendDisplayName } from "@openrift/shared/utils";
import { Area, AreaChart, ReferenceArea, ReferenceDot, XAxis, YAxis } from "recharts";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { trackMarketplaceClick } from "@/components/marketplace-link";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { CustomTagAssignments } from "@/hooks/use-collection-stats";
import {
  countsInPlaysetMode,
  filterByScope,
  filterStacksByScope,
} from "@/hooks/use-collection-stats";
import { compactFormatterForMarketplace } from "@/lib/format";
import { MARKETPLACE_META } from "@/lib/marketplace-meta";
import type { StackedEntry } from "@/lib/stacked-entry";
import type { CompletionCountMode } from "@/lib/stat-types";

interface CurvePoint {
  cost: number;
  percent: number;
  label?: string;
  itemPrice?: number;
  thumbnail?: string;
}

interface MilestonePoint {
  cost: number;
  percent: number;
  label: string;
}

interface CostToCompleteData {
  curve: CurvePoint[];
  milestones: MilestonePoint[];
  startPercent: number;
  maxPricedPercent: number;
  totalCost: number;
  unpricedMissing: number;
}

// Playset size (Legend/Battlefield = 1, [Unique] = 1, everything else = 3) lives
// in @openrift/shared/getPlaysetSize. Do not re-derive it here.

interface ComputeInput {
  allPrintings: Printing[];
  stacks: StackedEntry[];
  scope: CompletionScopePreference;
  customTagAssignments: CustomTagAssignments;
  countMode: CompletionCountMode;
  prices: PriceLookup;
  marketplace: Marketplace;
}

function computeCostToComplete(input: ComputeInput): CostToCompleteData {
  "use memo";
  const { allPrintings, stacks, scope, countMode, prices, marketplace } = input;

  const scopedPrintings = filterByScope(allPrintings, scope, input.customTagAssignments);
  const scopedStacks = filterStacksByScope(stacks, scope, input.customTagAssignments);

  if (countMode === "printings") {
    return computeForPrintings(scopedPrintings, scopedStacks, prices, marketplace);
  }
  if (countMode === "copies") {
    return computeForCopies(scopedPrintings, scopedStacks, prices, marketplace);
  }
  return computeForCards(scopedPrintings, scopedStacks, prices, marketplace);
}

function computeForCards(
  scopedPrintings: Printing[],
  stacks: StackedEntry[],
  prices: PriceLookup,
  marketplace: Marketplace,
): CostToCompleteData {
  const allCardSlugs = new Set<string>();
  for (const printing of scopedPrintings) {
    allCardSlugs.add(printing.card.slug);
  }

  const ownedSlugs = new Set<string>();
  for (const stack of stacks) {
    ownedSlugs.add(stack.printing.card.slug);
  }

  const printingsByCard = Map.groupBy(scopedPrintings, (printing) => printing.card.slug);

  const missingItems: MissingItem[] = [];
  let unpricedMissing = 0;

  for (const slug of allCardSlugs) {
    if (ownedSlugs.has(slug)) {
      continue;
    }
    const cardPrintings = printingsByCard.get(slug) ?? [];
    let cheapest: number | undefined;
    let cheapestPrinting: Printing | undefined;
    let cardName = slug;
    for (const printing of cardPrintings) {
      cardName = legendDisplayName(printing.card);
      const price = prices.get(printing.id, marketplace);
      if (price !== undefined && (cheapest === undefined || price < cheapest)) {
        cheapest = price;
        cheapestPrinting = printing;
      }
    }
    if (cheapest === undefined) {
      unpricedMissing++;
    } else {
      const cheapestImageId = cheapestPrinting?.images[0]?.imageId;
      missingItems.push({
        label: cardName,
        price: cheapest,
        thumbnail: cheapestImageId ? imageUrl(cheapestImageId, "240w") : undefined,
      });
    }
  }

  const totalItems = allCardSlugs.size;
  const ownedItems = ownedSlugs.size;
  return buildCurve(missingItems, totalItems, ownedItems, unpricedMissing);
}

function computeForPrintings(
  scopedPrintings: Printing[],
  stacks: StackedEntry[],
  prices: PriceLookup,
  marketplace: Marketplace,
): CostToCompleteData {
  const ownedPrintingIds = new Set<string>();
  for (const stack of stacks) {
    ownedPrintingIds.add(stack.printingId);
  }

  const missingItems: MissingItem[] = [];
  let unpricedMissing = 0;

  for (const printing of scopedPrintings) {
    if (ownedPrintingIds.has(printing.id)) {
      continue;
    }
    const price = prices.get(printing.id, marketplace);
    if (price === undefined) {
      unpricedMissing++;
    } else {
      const firstImageId = printing.images[0]?.imageId;
      missingItems.push({
        label: legendDisplayName(printing.card),
        price,
        thumbnail: firstImageId ? imageUrl(firstImageId, "240w") : undefined,
      });
    }
  }

  const totalItems = scopedPrintings.length;
  const ownedItems = ownedPrintingIds.size;
  return buildCurve(missingItems, totalItems, ownedItems, unpricedMissing);
}

function computeForCopies(
  scopedPrintings: Printing[],
  stacks: StackedEntry[],
  prices: PriceLookup,
  marketplace: Marketplace,
): CostToCompleteData {
  const allCardSlugs = new Map<string, { name: string; types: CardType[]; keywords: string[] }>();
  for (const printing of scopedPrintings) {
    if (!allCardSlugs.has(printing.card.slug)) {
      allCardSlugs.set(printing.card.slug, {
        name: legendDisplayName(printing.card),
        types: printing.card.types,
        keywords: printing.card.keywords,
      });
    }
  }

  const ownedCopiesBySlug = new Map<string, number>();
  for (const stack of stacks) {
    const slug = stack.printing.card.slug;
    ownedCopiesBySlug.set(slug, (ownedCopiesBySlug.get(slug) ?? 0) + stack.copyIds.length);
  }

  const printingsByCard = Map.groupBy(scopedPrintings, (printing) => printing.card.slug);

  const missingItems: MissingItem[] = [];
  let unpricedMissing = 0;
  let totalItems = 0;
  let ownedItems = 0;

  for (const [slug, card] of allCardSlugs) {
    if (!countsInPlaysetMode(card)) {
      continue;
    }
    const target = getPlaysetSize(card.types, card.keywords);
    const owned = Math.min(ownedCopiesBySlug.get(slug) ?? 0, target);
    const missing = target - owned;
    totalItems += target;
    ownedItems += owned;

    if (missing <= 0) {
      continue;
    }

    const cardPrintings = printingsByCard.get(slug) ?? [];
    let cheapest: number | undefined;
    let cheapestPrinting: Printing | undefined;
    for (const printing of cardPrintings) {
      const price = prices.get(printing.id, marketplace);
      if (price !== undefined && (cheapest === undefined || price < cheapest)) {
        cheapest = price;
        cheapestPrinting = printing;
      }
    }

    if (cheapest === undefined) {
      unpricedMissing += missing;
    } else {
      const cheapestImgId = cheapestPrinting?.images[0]?.imageId;
      const thumb = cheapestImgId ? imageUrl(cheapestImgId, "240w") : undefined;
      for (let index = 0; index < missing; index++) {
        missingItems.push({ label: card.name, price: cheapest, thumbnail: thumb });
      }
    }
  }

  return buildCurve(missingItems, totalItems, ownedItems, unpricedMissing);
}

interface MissingItem {
  label: string;
  price: number;
  thumbnail?: string;
}

function buildCurve(
  missingItems: MissingItem[],
  totalItems: number,
  ownedItems: number,
  unpricedMissing: number,
): CostToCompleteData {
  missingItems.sort((a, b) => a.price - b.price);

  const startPercent = totalItems > 0 ? (ownedItems / totalItems) * 100 : 0;

  const curve: CurvePoint[] = [{ cost: 0, percent: startPercent }];

  let cumulativeCost = 0;
  let currentOwned = ownedItems;

  for (const item of missingItems) {
    cumulativeCost += item.price;
    currentOwned++;
    const percent = totalItems > 0 ? (currentOwned / totalItems) * 100 : 0;
    curve.push({
      cost: cumulativeCost,
      percent,
      label: item.label,
      itemPrice: item.price,
      thumbnail: item.thumbnail,
    });
  }

  const maxPricedPercent =
    totalItems > 0 ? ((ownedItems + missingItems.length) / totalItems) * 100 : 0;

  const milestoneThresholds = [25, 50, 75, 90, 95, 100];
  const milestones: MilestonePoint[] = [];

  for (const threshold of milestoneThresholds) {
    if (threshold <= startPercent) {
      continue;
    }
    const point = curve.find((curvePoint) => curvePoint.percent >= threshold);
    if (point) {
      milestones.push({
        cost: point.cost,
        percent: point.percent,
        label: `${threshold}%`,
      });
    }
  }

  return {
    curve,
    milestones,
    startPercent,
    maxPricedPercent,
    totalCost: cumulativeCost,
    unpricedMissing,
  };
}

interface CostToCompleteActiveDotProps {
  cx?: number;
  cy?: number;
  payload?: CurvePoint;
  marketplace: Marketplace;
  searchUrl: (term: string) => string;
}

function CostToCompleteActiveDot({
  cx,
  cy,
  payload,
  marketplace,
  searchUrl,
}: CostToCompleteActiveDotProps) {
  if (!payload?.label || cx === undefined || cy === undefined) {
    return null;
  }
  const size = 20;
  const label = payload.label;
  return (
    <g
      className="cursor-pointer"
      onClick={() => {
        const url = searchUrl(label);
        trackMarketplaceClick(marketplace, url);
        window.open(url, "_blank", "noreferrer");
      }}
    >
      <circle cx={cx} cy={cy} r={size / 2 + 1} fill="var(--color-background)" opacity={0.9} />
      <svg
        x={cx - size / 2}
        y={cy - size / 2}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </svg>
    </g>
  );
}

function CostToCompleteTooltipContent({
  active,
  payload,
  formatPrice,
}: {
  active?: boolean;
  payload?: { payload: CurvePoint }[];
  formatPrice: (value: number) => string;
}) {
  const [firstEntry] = payload ?? [];
  if (!active || firstEntry === undefined) {
    return null;
  }

  const point = firstEntry.payload;

  return (
    <div className="border-border/50 bg-background flex min-w-36 gap-2.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-md">
      {point.thumbnail && <CardArtThumb src={point.thumbnail} className="h-16" />}
      <div>
        {point.label ? (
          <p className="mb-1 font-medium">{point.label}</p>
        ) : (
          <p className="mb-1 font-medium">Current collection</p>
        )}
        <div className="text-muted-foreground space-y-0.5">
          <p>
            Completion:{" "}
            <span className="text-foreground font-medium">{point.percent.toFixed(1)}%</span>
          </p>
          {point.itemPrice !== undefined && (
            <p>
              Card price:{" "}
              <span className="text-foreground font-medium">{formatPrice(point.itemPrice)}</span>
            </p>
          )}
          <p>
            Total spent:{" "}
            <span className="text-foreground font-medium">{formatPrice(point.cost)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

const chartConfig = {
  percent: {
    label: "Completion",
    color: "var(--color-primary)",
  },
} satisfies ChartConfig;

interface CostToCompleteChartProps {
  allPrintings: Printing[];
  stacks: StackedEntry[];
  scope: CompletionScopePreference;
  customTagAssignments: CustomTagAssignments;
  countMode: CompletionCountMode;
  prices: PriceLookup;
  marketplace: Marketplace;
}

export function CostToCompleteChart({
  allPrintings,
  stacks,
  scope,
  customTagAssignments,
  countMode,
  prices,
  marketplace,
}: CostToCompleteChartProps) {
  const formatPrice = compactFormatterForMarketplace(marketplace);

  const data = computeCostToComplete({
    allPrintings,
    stacks,
    scope,
    customTagAssignments,
    countMode,
    prices,
    marketplace,
  });

  if (data.curve.length <= 1) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        {data.startPercent >= 100
          ? "Collection is complete!"
          : "No price data available for missing items."}
      </p>
    );
  }

  const searchUrl = MARKETPLACE_META[marketplace].searchUrl;

  return (
    <div>
      <ChartContainer config={chartConfig} className="aspect-auto h-52 w-full">
        <AreaChart data={data.curve} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="costToCompleteFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.05} />
            </linearGradient>
            <pattern
              id="unpricedHatch"
              patternUnits="userSpaceOnUse"
              width={6}
              height={6}
              patternTransform="rotate(45)"
            >
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={6}
                stroke="var(--color-muted-foreground)"
                strokeWidth={1}
                strokeOpacity={0.25}
              />
            </pattern>
          </defs>
          <XAxis
            dataKey="cost"
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(value: number) => formatPrice(value)}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            dataKey="percent"
            type="number"
            domain={[Math.floor(data.startPercent / 5) * 5, 100]}
            tickFormatter={(value: number) => `${value}%`}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--color-border)", strokeDasharray: "4 4" }}
            content={<CostToCompleteTooltipContent formatPrice={formatPrice} />}
          />
          <Area
            dataKey="percent"
            type="stepAfter"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#costToCompleteFill)"
            isAnimationActive={false}
            dot={false}
            activeDot={<CostToCompleteActiveDot marketplace={marketplace} searchUrl={searchUrl} />}
          />
          <ReferenceDot
            x={0}
            y={data.startPercent}
            r={5}
            fill="var(--color-primary)"
            stroke="var(--color-background)"
            strokeWidth={2}
          />
          {data.unpricedMissing > 0 && data.maxPricedPercent < 100 && (
            <ReferenceArea
              y1={data.maxPricedPercent}
              y2={100}
              fill="url(#unpricedHatch)"
              fillOpacity={1}
              stroke="none"
              label={{
                value: `${data.unpricedMissing} unpriced`,
                position: "insideTopRight",
                className: "fill-muted-foreground text-2xs",
              }}
            />
          )}
        </AreaChart>
      </ChartContainer>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <span className="bg-primary inline-block size-2.5 rounded-full" />
          You are here: {data.startPercent.toFixed(1)}%
        </span>
        <span className="text-muted-foreground">
          Cost to complete: {formatPrice(data.totalCost)}
        </span>
        {data.unpricedMissing > 0 && (
          <span className="text-muted-foreground flex items-center gap-1.5">
            <svg className="inline-block size-2.5" viewBox="0 0 10 10">
              <rect width={10} height={10} fill="url(#unpricedHatchLegend)" />
              <defs>
                <pattern
                  id="unpricedHatchLegend"
                  patternUnits="userSpaceOnUse"
                  width={3}
                  height={3}
                  patternTransform="rotate(45)"
                >
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={3}
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeOpacity={0.5}
                  />
                </pattern>
              </defs>
            </svg>
            {data.unpricedMissing} unpriced {data.unpricedMissing === 1 ? "card" : "cards"} (no
            market data)
          </span>
        )}
      </div>
    </div>
  );
}
