import type { Marketplace, PackResult, PriceLookup } from "@openrift/shared";

import { compactFormatterForMarketplace, formatterForMarketplace } from "@/lib/format";

interface PackStatsProps {
  packs: PackResult[];
  prices: PriceLookup;
  marketplace: Marketplace | null;
}

interface PullStat {
  cardName: string;
  shortCode: string;
  rarity: string;
  value: number;
}

const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic", "Showcase"];

// Aggregate display below the pack grid. Shows totals, rarity counts, and the most valuable pulls.
export function PackStats({ packs, prices, marketplace }: PackStatsProps) {
  const rarityCounts: Record<string, number> = {};
  const topPulls: PullStat[] = [];
  let totalValue = 0;
  let valuedCount = 0;

  for (const pack of packs) {
    for (const pull of pack.pulls) {
      const rarityKey =
        pull.slot === "rune"
          ? "Rune"
          : pull.slot === "ultimate"
            ? "Ultimate"
            : pull.printing.rarity;
      rarityCounts[rarityKey] = (rarityCounts[rarityKey] ?? 0) + 1;

      if (marketplace) {
        const value = prices.get(pull.printing.id, marketplace);
        if (value !== undefined) {
          totalValue += value;
          valuedCount++;
          topPulls.push({
            cardName: pull.printing.cardName,
            shortCode: pull.printing.shortCode,
            rarity: rarityKey,
            value,
          });
        }
      }
    }
  }

  const averageValue = packs.length > 0 ? totalValue / packs.length : 0;
  const sortedRarities = Object.keys(rarityCounts).toSorted((a, b) => {
    const ia = RARITY_ORDER.indexOf(a);
    const ib = RARITY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) {
      return a.localeCompare(b);
    }
    if (ia === -1) {
      return 1;
    }
    if (ib === -1) {
      return -1;
    }
    return ia - ib;
  });
  topPulls.sort((a, b) => b.value - a.value);
  const top = topPulls.slice(0, 5);

  const fullFmt = marketplace ? formatterForMarketplace(marketplace) : null;
  const compactFmt = marketplace ? compactFormatterForMarketplace(marketplace) : null;

  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Packs" value={packs.length.toString()} />
        {fullFmt ? (
          <>
            <StatTile label="Total value" value={fullFmt(totalValue)} />
            <StatTile label="Average per pack" value={fullFmt(averageValue)} />
            <StatTile
              label="Priced pulls"
              value={`${valuedCount} / ${packs.length * (packs[0]?.pulls.length ?? 0)}`}
            />
          </>
        ) : (
          <StatTile
            label="Value"
            value="Sign in to see marketplace value"
            valueClass="text-muted-foreground text-sm"
          />
        )}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 font-semibold">Rarity breakdown</h3>
          <ul className="space-y-0.5 text-sm">
            {sortedRarities.map((rarity) => (
              <li key={rarity} className="flex justify-between gap-2">
                <span>{rarity}</span>
                <span className="tabular-nums">{rarityCounts[rarity]}</span>
              </li>
            ))}
          </ul>
        </div>
        {top.length > 0 && compactFmt && (
          <div>
            <h3 className="mb-2 font-semibold">Top pulls</h3>
            <ul className="space-y-0.5 text-sm">
              {top.map((pull, i) => (
                <li
                  key={`${pull.shortCode}-${i}`}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="truncate">
                    {pull.cardName}
                    <span className="text-muted-foreground ml-1">({pull.shortCode})</span>
                  </span>
                  <span className="tabular-nums">{compactFmt(pull.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-xs tracking-wide uppercase">{label}</div>
      <div className={valueClass ?? "mt-1 text-xl font-semibold tabular-nums"}>{value}</div>
    </div>
  );
}
