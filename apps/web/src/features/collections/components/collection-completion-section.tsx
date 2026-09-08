import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type { CompletionScopePreference } from "@openrift/shared/types/api/preferences";
import type { Domain } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { CardIcon } from "@/components/card-icon";
import { ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { SectionHeading } from "@/components/ui/section-heading";
import type { FilterSearch } from "@/features/cards/lib/search-schemas";
import type {
  CollectionStatsResult,
  CompletionEntry,
} from "@/features/collections/hooks/use-collection-stats";
import {
  computeCompletion,
  filterByScope,
} from "@/features/collections/hooks/use-collection-stats";
import type { CompletionCountMode, CompletionGroupBy } from "@/features/collections/lib/stat-types";
import { buildMissingSearch } from "@/features/collections/lib/stats-missing-search";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { getDomainColor } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

function CompletionTotalRow({ entries }: { entries: CompletionEntry[] }) {
  const totalOwned = entries.reduce((sum, entry) => sum + entry.owned, 0);
  const totalAll = entries.reduce((sum, entry) => sum + entry.total, 0);
  const percent = totalAll > 0 ? (totalOwned / totalAll) * 100 : 0;

  return (
    <div className="bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5">
      <span className="flex w-36 shrink-0 items-center text-sm font-semibold sm:w-48">Overall</span>
      <ProgressPrimitive.Root value={Math.min(percent, 100)} className="flex-1">
        <ProgressTrack className="h-1.5">
          <ProgressIndicator className="rounded-full" />
        </ProgressTrack>
      </ProgressPrimitive.Root>
      <span className="text-muted-foreground w-20 shrink-0 text-right text-xs tabular-nums">
        {totalOwned.toLocaleString()} / {totalAll.toLocaleString()}
      </span>
      <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums">
        {percent.toFixed(1)}%
      </span>
      <span className="w-3.5 shrink-0" />
    </div>
  );
}

function CompletionRow({
  entry,
  icon,
  barColor,
  missingSearch,
}: {
  entry: CompletionEntry;
  icon?: string;
  barColor?: string;
  missingSearch?: Partial<FilterSearch>;
}) {
  const missing = entry.total - entry.owned;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="flex w-36 shrink-0 items-center gap-1.5 truncate text-sm font-medium sm:w-48">
        {icon && <CardIcon src={icon} className="size-4 shrink-0" />}
        {entry.label}
      </span>
      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-all", !barColor && "bg-primary")}
          style={{
            width: `${Math.min(entry.percent, 100)}%`,
            ...(barColor ? { backgroundColor: barColor } : {}),
          }}
        />
      </div>
      <span className="text-muted-foreground w-20 shrink-0 text-right text-xs tabular-nums">
        {entry.owned} / {entry.total}
      </span>
      <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums">
        {entry.percent.toFixed(0)}%
      </span>
      {missingSearch ? (
        <Link
          to="/cards"
          search={missingSearch}
          title={`Browse ${missing} missing`}
          className={cn(
            "shrink-0",
            missing > 0
              ? "text-muted-foreground hover:text-foreground"
              : "pointer-events-none invisible",
          )}
          tabIndex={missing > 0 ? undefined : -1}
        >
          <ExternalLinkIcon className="size-3.5" />
        </Link>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
    </div>
  );
}

function getRowIcon(groupBy: CompletionGroupBy, key: string): string | undefined {
  switch (groupBy) {
    case "domain": {
      return getFilterIconPath("domains", key);
    }
    case "rarity": {
      return getFilterIconPath("rarities", key);
    }
    case "type": {
      return getFilterIconPath("types", key);
    }
    default: {
      return undefined;
    }
  }
}

export function CompletionSection({
  stats,
  groupBy,
  countMode,
  scope,
}: {
  stats: CollectionStatsResult;
  groupBy: CompletionGroupBy;
  countMode: CompletionCountMode;
  scope: CompletionScopePreference;
}) {
  const domainColors = useDomainColors();
  const { rarityColors, labels } = useEnumOrders();

  const scopedPrintings = filterByScope(stats.allPrintings, scope, stats.customTagAssignments);

  const entries = computeCompletion({
    stacks: stats.stacks,
    scopedPrintings,
    scope,
    customTagAssignments: stats.customTagAssignments,
    sets: stats.sets,
    groupBy,
    countMode,
    orders: stats.orders,
    labels: {
      domains: labels.domains,
      rarities: labels.rarities,
      cardTypes: labels.cardTypes,
    },
  });

  const mainEntries =
    groupBy === "set"
      ? entries.filter((entry) => entry.setType === WellKnown.setType.MAIN)
      : entries;
  const supplementalEntries =
    groupBy === "set"
      ? entries.filter((entry) => entry.setType === WellKnown.setType.SUPPLEMENTAL)
      : [];

  function rowBarColor(key: string): string | undefined {
    if (groupBy === "domain") {
      return getDomainColor(key as Domain, domainColors);
    }
    if (groupBy === "rarity") {
      return rarityColors[key];
    }
    return undefined;
  }

  const setIdToSlug = new Map(stats.sets.map((set) => [set.id, set.slug]));
  const missingSearch = (key: string): Partial<FilterSearch> | undefined =>
    buildMissingSearch({ countMode, groupBy, key, scope, setIdToSlug });

  return (
    <section>
      <CompletionTotalRow entries={entries} />

      {mainEntries.length === 0 && supplementalEntries.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">No data</p>
      ) : (
        <>
          <div>
            {mainEntries.map((entry) => (
              <CompletionRow
                key={entry.key}
                entry={entry}
                icon={getRowIcon(groupBy, entry.key)}
                barColor={rowBarColor(entry.key)}
                missingSearch={missingSearch(entry.key)}
              />
            ))}
          </div>
          {supplementalEntries.length > 0 && (
            <div className="mt-3">
              <SectionHeading as="h3" className="mb-1">
                Supplemental
              </SectionHeading>
              {supplementalEntries.map((entry) => (
                <CompletionRow
                  key={entry.key}
                  entry={entry}
                  icon={getRowIcon(groupBy, entry.key)}
                  barColor={rowBarColor(entry.key)}
                  missingSearch={missingSearch(entry.key)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
