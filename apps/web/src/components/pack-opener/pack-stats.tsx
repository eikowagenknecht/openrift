import type { Marketplace, PackPull, PackResult, PriceLookup } from "@openrift/shared";
import { useState } from "react";

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

const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic", "Showcase", "Rune", "Ultimate"];
// Fallbacks for rarities the `rarities` DB table doesn't cover — Rune and
// Ultimate are slot-derived labels rather than true rarity rows.
const RARITY_FALLBACK_COLORS: Record<string, string> = {
  Rune: "#6b7280",
  Ultimate: "#d946ef",
};
const NOTABLE_RARITIES = new Set(["Rare", "Epic", "Showcase", "Ultimate"]);

// Compact summary rendered below the pack grid once the reveal is complete.
// One panel with a headline row, a horizontal rarity breakdown bar, and a
// single "notable pulls" list that merges top pulls (by value) with any
// high-rarity pulls that lack price data.
export function PackStats({ packs, prices, marketplace }: PackStatsProps) {
  const { rarityColors } = useEnumOrders();
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
          cardName: pull.printing.cardName,
          shortCode: pull.printing.shortCode,
          rarity,
        });
      }
      allPulls.push({ pull, rarity, value });
    }
  }

  // Sort unpriced by rarity desc so the interesting ones (rares, epics) rise
  // to the top when the user expands the list.
  unpricedPulls.sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));

  const totalPulls = allPulls.length;
  const averageValue = packs.length > 0 ? totalValue / packs.length : 0;
  // 13 pulls is too few to make a meaningful distribution chart out of.
  const showRarityBar = packs.length > 1;

  const notable = buildNotablePulls(allPulls);

  const fullFmt = marketplace ? formatterForMarketplace(marketplace) : null;
  const compactFmt = marketplace ? compactFormatterForMarketplace(marketplace) : null;

  const rarityOrderedCounts = RARITY_ORDER.filter((r) => (rarityCounts[r] ?? 0) > 0).map((r) => ({
    rarity: r,
    count: rarityCounts[r] ?? 0,
    color: rarityColors[r] ?? RARITY_FALLBACK_COLORS[r] ?? "#888",
  }));

  return (
    <div className="bg-card space-y-4 rounded-xl border p-4">
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
    </div>
  );
}

function rarityKeyFor(pull: PackPull): string {
  if (pull.slot === "rune") {
    return "Rune";
  }
  if (pull.slot === "ultimate") {
    return "Ultimate";
  }
  return pull.printing.rarity;
}

// Build the "notable pulls" list: any rare+ or foil-slot pull is always
// included; then the top remaining pulls by value fill out up to 10 slots.
// Priced pulls come first, sorted by value descending. Unpriced high-rarity
// pulls come after, sorted by rarity descending, with a `—` price marker.
function buildNotablePulls(
  allPulls: readonly { pull: PackPull; rarity: string; value: number | undefined }[],
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
      pull.slot === "foil" ||
      pull.slot === "showcase" ||
      pull.slot === "ultimate";
    if (!isNotableRarity) {
      continue;
    }
    // Filter out the noise: a foil common that's worth 20¢ isn't "notable"
    // in any useful sense. Keep unpriced cards in — they might be the most
    // interesting ones in the list (no market data yet).
    if (value !== undefined && value < 1) {
      continue;
    }
    seen.add(key);
    notable.push({
      cardName: pull.printing.cardName,
      shortCode: pull.printing.shortCode,
      rarity,
      slotLabel: slotLabel(pull),
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
    // Both unpriced: sort by rarity desc (highest rarity first)
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
            <button
              type="button"
              onClick={onToggleUnpriced}
              aria-expanded={unpricedVisible}
              className="text-muted-foreground hover:text-foreground cursor-pointer text-xs underline decoration-dotted underline-offset-4 transition-colors"
            >
              ({unpricedCount} without price data)
            </button>
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
  // Segments render inline with a flex row. Small segments (narrow width)
  // show only the count so labels don't overflow.
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

function slotLabel(pull: PackPull): string {
  switch (pull.slot) {
    case "common": {
      return "Common";
    }
    case "uncommon": {
      return "Uncommon";
    }
    case "flex": {
      return pull.printing.rarity;
    }
    case "foil": {
      return `Foil ${pull.printing.rarity}`;
    }
    case "rune": {
      return "Rune";
    }
    case "showcase": {
      if (pull.printing.isSigned) {
        return "Signed";
      }
      if (pull.printing.artVariant === "overnumbered") {
        return "Overnumbered";
      }
      return "Alt Art";
    }
    case "ultimate": {
      return "Ultimate";
    }
  }
}
