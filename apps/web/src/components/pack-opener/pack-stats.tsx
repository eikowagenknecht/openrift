import type { Marketplace, PackPull, PackResult, PriceLookup } from "@openrift/shared";
import { WellKnown, legendDisplayName } from "@openrift/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEnumOrders } from "@/hooks/use-enums";
import { compactFormatterForMarketplace, formatterForMarketplace } from "@/lib/format";

interface PackStatsProps {
  packs: PackResult[];
  prices: PriceLookup;
  marketplace: Marketplace | null;
}

interface NotablePull {
  cardName: string;
  shortCode: string;
  rarity: string;
  slotLabel: string;
  value: number | undefined;
}

interface UnpricedPull {
  cardName: string;
  shortCode: string;
  rarity: string;
}

const RARITY_ORDER: readonly string[] = [
  WellKnown.rarity.COMMON,
  WellKnown.rarity.UNCOMMON,
  WellKnown.rarity.RARE,
  WellKnown.rarity.EPIC,
  WellKnown.rarity.SHOWCASE,
  WellKnown.cardType.RUNE,
  WellKnown.artVariant.ULTIMATE,
];
// Rune and Ultimate are slot-derived labels, not rows in the `rarities` table.
const RARITY_FALLBACK_COLORS: Record<string, string> = {
  [WellKnown.cardType.RUNE]: "#6b7280",
  [WellKnown.artVariant.ULTIMATE]: "#d946ef",
};
const NOTABLE_RARITIES = new Set<string>([
  WellKnown.rarity.RARE,
  WellKnown.rarity.EPIC,
  WellKnown.rarity.SHOWCASE,
  WellKnown.artVariant.ULTIMATE,
]);

export function PackStats({ packs, prices, marketplace }: PackStatsProps) {
  const { rarityColors, labels } = useEnumOrders();
  const rarityLabel = (slug: string) =>
    slug === WellKnown.cardType.RUNE
      ? "Rune"
      : slug === WellKnown.artVariant.ULTIMATE
        ? "Ultimate"
        : labels.rarities[slug];
  const [unpricedVisible, setUnpricedVisible] = useState(false);

  const rarityCounts: Record<string, number> = {};
  let totalValue = 0;
  let valuedCount = 0;
  const allPulls: { pull: PackPull; rarity: string; value: number | undefined }[] = [];
  const unpricedPulls: UnpricedPull[] = [];

  for (const pack of packs) {
    for (const pull of pack.pulls) {
      const rarity = rarityKeyFor(pull);
      rarityCounts[rarity] = (rarityCounts[rarity] ?? 0) + 1;
      const value = marketplace ? prices.get(pull.printing.id, marketplace) : undefined;
      if (value !== undefined) {
        totalValue += value;
        valuedCount++;
      } else if (marketplace) {
        unpricedPulls.push({
          cardName: legendDisplayName({
            name: pull.printing.cardName,
            types: pull.printing.cardTypes,
            tags: pull.printing.tags,
          }),
          shortCode: pull.printing.shortCode,
          rarity: rarityLabel(rarity),
        });
      }
      allPulls.push({ pull, rarity, value });
    }
  }

  unpricedPulls.sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));

  const totalPulls = allPulls.length;
  const averageValue = packs.length > 0 ? totalValue / packs.length : 0;
  // A single 13-card pack is too few pulls for a meaningful distribution bar.
  const showRarityBar = packs.length > 1;

  const notable = buildNotablePulls(allPulls, rarityLabel);

  const fullFmt = marketplace ? formatterForMarketplace(marketplace) : null;
  const compactFmt = marketplace ? compactFormatterForMarketplace(marketplace) : null;

  const rarityOrderedCounts = RARITY_ORDER.filter((r) => (rarityCounts[r] ?? 0) > 0).map((r) => ({
    rarity: rarityLabel(r),
    count: rarityCounts[r] ?? 0,
    color: rarityColors[r] ?? RARITY_FALLBACK_COLORS[r] ?? "#888",
  }));

  return (
    <Card className="p-4">
      <StatsHeadline
        packCount={packs.length}
        totalPulls={totalPulls}
        valuedCount={valuedCount}
        totalValue={totalValue}
        averageValue={averageValue}
        fullFmt={fullFmt}
        unpricedVisible={unpricedVisible}
        onToggleUnpriced={() => setUnpricedVisible((v) => !v)}
      />

      {showRarityBar && <RarityBar counts={rarityOrderedCounts} total={totalPulls} />}

      {notable.length > 0 && <NotablePullsList pulls={notable} compactFmt={compactFmt} />}

      {unpricedVisible && unpricedPulls.length > 0 && <UnpricedPullsList pulls={unpricedPulls} />}
    </Card>
  );
}

function rarityKeyFor(pull: PackPull): string {
  if (pull.slot === WellKnown.packSlot.TOKEN) {
    return pull.printing.cardSuperTypes.includes(WellKnown.superType.TOKEN)
      ? WellKnown.superType.TOKEN
      : WellKnown.cardType.RUNE;
  }
  if (pull.slot === WellKnown.packSlot.ULTIMATE) {
    return WellKnown.artVariant.ULTIMATE;
  }
  return pull.printing.rarity;
}

function buildNotablePulls(
  allPulls: readonly { pull: PackPull; rarity: string; value: number | undefined }[],
  rarityLabel: (slug: string) => string,
): NotablePull[] {
  const seen = new Set<string>();
  const notable: NotablePull[] = [];

  for (const { pull, rarity, value } of allPulls) {
    const key = `${pull.printing.id}-${pull.slot}`;
    if (seen.has(key)) {
      continue;
    }
    const isNotableRarity =
      NOTABLE_RARITIES.has(rarity) ||
      pull.slot === WellKnown.packSlot.FOIL ||
      pull.slot === WellKnown.packSlot.SHOWCASE ||
      pull.slot === WellKnown.packSlot.ULTIMATE;
    if (!isNotableRarity) {
      continue;
    }
    // A priced pull under $1 isn't notable; an unpriced one might still be.
    if (value !== undefined && value < 1) {
      continue;
    }
    seen.add(key);
    notable.push({
      cardName: legendDisplayName({
        name: pull.printing.cardName,
        types: pull.printing.cardTypes,
        tags: pull.printing.tags,
      }),
      shortCode: pull.printing.shortCode,
      rarity,
      slotLabel: slotLabel(pull, rarityLabel),
      value,
    });
  }

  notable.sort((a, b) => {
    const aPriced = a.value !== undefined;
    const bPriced = b.value !== undefined;
    if (aPriced && bPriced) {
      return (b.value ?? 0) - (a.value ?? 0);
    }
    if (aPriced !== bPriced) {
      return aPriced ? -1 : 1;
    }
    return RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
  });

  return notable.slice(0, 10);
}

function StatsHeadline({
  packCount,
  totalPulls,
  valuedCount,
  totalValue,
  averageValue,
  fullFmt,
  unpricedVisible,
  onToggleUnpriced,
}: {
  packCount: number;
  totalPulls: number;
  valuedCount: number;
  totalValue: number;
  averageValue: number;
  fullFmt: ((n: number) => string) | null;
  unpricedVisible: boolean;
  onToggleUnpriced: () => void;
}) {
  const packWord = packCount === 1 ? "pack" : "packs";
  const unpricedCount = totalPulls - valuedCount;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className="text-foreground text-lg font-semibold tabular-nums">
        {packCount} {packWord}
      </span>
      {fullFmt ? (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="text-foreground font-medium tabular-nums">
            {fullFmt(totalValue)} total
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground tabular-nums">{fullFmt(averageValue)}/pack</span>
          {unpricedCount > 0 && (
            <Button
              type="button"
              variant="link-muted"
              onClick={onToggleUnpriced}
              aria-expanded={unpricedVisible}
              className="h-auto px-0 text-xs decoration-dotted underline-offset-4"
            >
              ({unpricedCount} without price data)
            </Button>
          )}
        </>
      ) : (
        <span className="text-muted-foreground text-sm">Sign in to see marketplace value</span>
      )}
    </div>
  );
}

function RarityBar({
  counts,
  total,
}: {
  counts: { rarity: string; count: number; color: string }[];
  total: number;
}) {
  if (total === 0) {
    return null;
  }
  return (
    <div>
      <div className="border-border/50 flex h-8 w-full overflow-hidden rounded-md border text-xs font-medium">
        {counts.map(({ rarity, count, color }) => {
          const width = (count / total) * 100;
          const compact = width < 10;
          return (
            <div
              key={rarity}
              className="flex items-center justify-center overflow-hidden px-1.5 text-center whitespace-nowrap text-neutral-950"
              style={{
                width: `${width}%`,
                backgroundColor: color,
              }}
              title={`${rarity}: ${count}`}
            >
              {compact ? count : `${rarity} ${count}`}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotablePullsList({
  pulls,
  compactFmt,
}: {
  pulls: NotablePull[];
  compactFmt: ((n: number) => string) | null;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Notable pulls</h3>
      <ul className="grid gap-x-8 text-sm md:grid-cols-2">
        {pulls.map((pull, i) => (
          <li
            key={`${pull.shortCode}-${i}`}
            className="border-border/40 flex items-baseline justify-between gap-3 border-b py-1 last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
          >
            <span className="min-w-0 truncate">
              {pull.cardName}
              <span className="text-muted-foreground ml-1 font-mono text-xs">{pull.shortCode}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-3 text-xs">
              <span className="text-muted-foreground">{pull.slotLabel}</span>
              <span className="tabular-nums">
                {pull.value !== undefined && compactFmt ? compactFmt(pull.value) : "—"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnpricedPullsList({ pulls }: { pulls: UnpricedPull[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Cards without price data</h3>
      <ul className="grid gap-x-8 text-sm md:grid-cols-2">
        {pulls.map((pull, i) => (
          <li
            key={`${pull.shortCode}-${i}`}
            className="border-border/40 flex items-baseline justify-between gap-3 border-b py-1 last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
          >
            <span className="min-w-0 truncate">
              {pull.cardName}
              <span className="text-muted-foreground ml-1 font-mono text-xs">{pull.shortCode}</span>
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">{pull.rarity}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function slotLabel(pull: PackPull, rarityLabel: (slug: string) => string): string {
  switch (pull.slot) {
    case WellKnown.packSlot.COMMON: {
      return "Common";
    }
    case WellKnown.packSlot.UNCOMMON: {
      return "Uncommon";
    }
    case WellKnown.packSlot.FLEX: {
      return rarityLabel(pull.printing.rarity);
    }
    case WellKnown.packSlot.FOIL: {
      return `Foil ${rarityLabel(pull.printing.rarity)}`;
    }
    case WellKnown.packSlot.TOKEN: {
      if (pull.printing.cardSuperTypes.includes(WellKnown.superType.TOKEN)) {
        return "Token";
      }
      if (pull.printing.finish === WellKnown.finish.FOIL) {
        return "Foil Rune";
      }
      if (pull.printing.artVariant !== WellKnown.artVariant.NORMAL) {
        return "Alt Art Rune";
      }
      return "Rune";
    }
    case WellKnown.packSlot.SHOWCASE: {
      if (pull.printing.isSigned) {
        return "Signed";
      }
      if (pull.printing.isOvernumbered) {
        return "Overnumbered";
      }
      return "Alt Art";
    }
    case WellKnown.packSlot.ULTIMATE: {
      return "Ultimate";
    }
  }
}
