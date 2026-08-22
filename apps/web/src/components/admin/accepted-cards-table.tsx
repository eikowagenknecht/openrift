import type { CandidateCardSummaryResponse } from "@openrift/shared";
import { matchesCardQuery } from "@openrift/shared";
import { formatShortCodesArray } from "@openrift/shared/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import { LoaderIcon, StarIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { AdminCardTableFeatures } from "@/components/admin/admin-card-table-shared";
import {
  adminCardTableFeatures,
  useAdminCardsTableUrlSync,
  useVirtualizedTableRows,
  VirtualizedAdminCardTable,
} from "@/components/admin/admin-card-table-shared";
import { DebouncedSearchInput } from "@/components/admin/debounced-search-input";
import { SortableHeader } from "@/components/admin/sortable-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  acceptFavoritePrintingsFn,
  useAcceptFavoritePrintings,
} from "@/hooks/use-admin-card-mutations";
import type { AdminCardListStatus } from "@/hooks/use-card-review-navigation";
import { parseSortParam } from "@/lib/admin-cards-search";
import {
  ALL_ASSIGNABLE_SCOPE,
  bucketScopeKey,
  bucketsMatchScope,
  scopeLabel,
} from "@/lib/marketplace-coverage";
import type {
  CardCoverage,
  DirectionCoverage,
  MarketplaceCoverage,
  PriceAssignBucket,
} from "@/lib/marketplace-coverage";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Route as CardsRoute } from "@/routes/_app/_authenticated/admin/cards";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Row = CandidateCardSummaryResponse;

// ---------------------------------------------------------------------------
// Accept button component (needs hooks)
// ---------------------------------------------------------------------------

function AcceptFavoriteButton({ cardSlug, count }: { cardSlug: string; count: number }) {
  const acceptFavorite = useAcceptFavoritePrintings();

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-6 gap-1 px-2 text-xs"
      disabled={acceptFavorite.isPending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        acceptFavorite.mutate(cardSlug, {
          onSuccess: (data) => {
            const result = data as {
              printingsCreated: number;
              skipped: { shortCode: string; reason: string }[];
            };
            if (result.printingsCreated > 0 && result.skipped.length === 0) {
              toast.success(
                `Accepted ${result.printingsCreated} printing${result.printingsCreated === 1 ? "" : "s"}`,
              );
            } else if (result.printingsCreated > 0 && result.skipped.length > 0) {
              toast.warning(
                `Accepted ${result.printingsCreated}, skipped ${result.skipped.length}: ${result.skipped.map((s) => `${s.shortCode} (${s.reason})`).join(", ")}`,
              );
            } else if (result.skipped.length > 0) {
              toast.error(
                `All skipped: ${result.skipped.map((s) => `${s.shortCode} (${s.reason})`).join(", ")}`,
              );
            } else {
              toast.info("No printings to accept");
            }
          },
        });
      }}
    >
      {acceptFavorite.isPending ? <LoaderIcon className="animate-spin" /> : <StarIcon />}
      Accept ({count})
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Marketplace coverage badges
// ---------------------------------------------------------------------------

// Match the per-printing badges on the card detail page (printing-marketplace-cells.tsx):
// fill /10, border /30, text-{color}-600 dark:text-{color}-400, with "outline"
// (border-border + text-foreground, no fill) for the empty state.
const HALF_BG_CLASS: Record<DirectionCoverage["status"], string> = {
  full: "bg-emerald-500/10",
  partial: "bg-amber-500/10",
  none: "bg-destructive/10",
  na: "",
};

const BORDER_CLASS: Record<DirectionCoverage["status"], string> = {
  full: "border-emerald-500/30",
  partial: "border-amber-500/30",
  none: "border-destructive/30",
  na: "border-border",
};

const TEXT_CLASS: Record<DirectionCoverage["status"], string> = {
  full: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  none: "text-destructive",
  na: "text-foreground",
};

const SEVERITY_RANK: Record<DirectionCoverage["status"], number> = {
  none: 0,
  partial: 1,
  full: 2,
  na: 3,
};

function weakerStatus(a: DirectionCoverage["status"], b: DirectionCoverage["status"]) {
  if (a === "na") {
    return b;
  }
  if (b === "na") {
    return a;
  }
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

type Direction = "printings" | "entries";

function directionTooltip(
  fullLabel: string,
  direction: Direction,
  coverage: DirectionCoverage,
): string {
  const plural = direction === "printings" ? "printings" : "entries";
  const singular = direction === "printings" ? "printing" : "entry";
  const otherSingular = direction === "printings" ? "entry" : "printing";
  if (coverage.status === "na") {
    return `${fullLabel} ${plural}: none to track for this card`;
  }
  if (coverage.status === "none") {
    return `${fullLabel}: 0/${coverage.total} ${plural} have a matching ${otherSingular}`;
  }
  if (coverage.status === "full") {
    return `${fullLabel}: every ${singular} (${coverage.total}) has a matching ${otherSingular}`;
  }
  return `${fullLabel}: ${coverage.mapped}/${coverage.total} ${plural} have a matching ${otherSingular}`;
}

function MarketplaceSplitBadge({
  shortName,
  fullLabel,
  coverage,
}: {
  shortName: string;
  fullLabel: string;
  coverage: MarketplaceCoverage;
}) {
  const textStatus = weakerStatus(coverage.printings.status, coverage.entries.status);
  // Native title attributes instead of BaseUI Tooltip: rendered ~500 of these
  // in the virtualized admin Cards table and the per-instance state machine
  // dominated scroll cost. Plain strings, no rich content needed.
  return (
    <div className="relative inline-flex h-5 min-w-10 font-mono text-xs">
      <div
        aria-label={`${fullLabel} printings status`}
        title={directionTooltip(fullLabel, "printings", coverage.printings)}
        className={cn(
          "flex-1 cursor-default rounded-l-md border border-r-0",
          HALF_BG_CLASS[coverage.printings.status],
          BORDER_CLASS[coverage.printings.status],
        )}
      />
      <div
        aria-label={`${fullLabel} entries status`}
        title={directionTooltip(fullLabel, "entries", coverage.entries)}
        className={cn(
          "flex-1 cursor-default rounded-r-md border border-l-0",
          HALF_BG_CLASS[coverage.entries.status],
          BORDER_CLASS[coverage.entries.status],
        )}
      />
      <span
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center px-2",
          TEXT_CLASS[textStatus],
        )}
      >
        {shortName}
      </span>
    </div>
  );
}

function MarketplaceCoverageBadges({ coverage }: { coverage: CardCoverage | undefined }) {
  if (!coverage) {
    return <span className="text-muted-foreground/50 text-xs">—</span>;
  }
  return (
    <span className="flex items-center gap-1">
      <MarketplaceSplitBadge shortName="TCG" fullLabel="TCGplayer" coverage={coverage.tcgplayer} />
      <MarketplaceSplitBadge shortName="CM" fullLabel="Cardmarket" coverage={coverage.cardmarket} />
      <MarketplaceSplitBadge shortName="CT" fullLabel="CardTrader" coverage={coverage.cardtrader} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sort weighting for the marketplace coverage column
// ---------------------------------------------------------------------------

// Sort partially-mapped cards highest so admins see the work-in-progress
// rows first, then unmapped, then n/a, then fully-mapped (least urgent).
const STATUS_WEIGHT: Record<DirectionCoverage["status"], number> = {
  partial: 0,
  none: 1,
  na: 2,
  full: 3,
};

function marketplaceSortValue(mp: MarketplaceCoverage): number {
  return Math.min(STATUS_WEIGHT[mp.printings.status], STATUS_WEIGHT[mp.entries.status]);
}

function coverageSortValue(coverage: CardCoverage | undefined): number {
  if (!coverage) {
    return 99;
  }
  return (
    marketplaceSortValue(coverage.tcgplayer) * 100 +
    marketplaceSortValue(coverage.cardmarket) * 10 +
    marketplaceSortValue(coverage.cardtrader)
  );
}

// ---------------------------------------------------------------------------
// Column widths (applied with table-layout: fixed so filtering doesn't reflow)
// ---------------------------------------------------------------------------

const COLUMN_WIDTHS: Record<string, string> = {
  name: "25%",
  printings: "32%",
  marketplaces: "140px",
};

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function buildColumns(
  coverageBySlug: Map<string, CardCoverage>,
  setSlug: string | undefined,
  listStatus: AdminCardListStatus | undefined,
  priceScope: string | undefined,
  isAdmin: boolean,
): ColumnDef<AdminCardTableFeatures, Row>[] {
  // Clicking a row starts a review run, so hand the detail page the same filter
  // the list is showing — its prev/next then walks only these cards.
  const detailSearch = {
    ...(setSlug ? { set: setSlug } : {}),
    ...(listStatus ? { status: listStatus } : {}),
    ...(priceScope ? { priceScope } : {}),
  };
  return [
    {
      id: "name",
      accessorFn: (r) => r.name,
      header: ({ column }) => <SortableHeader column={column} label="Card" />,
      enableGlobalFilter: true,
      cell: ({ row }) => {
        const r = row.original;
        const slug = r.cardSlug ?? r.normalizedName;
        const total = r.uncheckedCardCount + r.uncheckedPrintingCount;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to="/admin/cards/$cardSlug"
              params={{ cardSlug: slug }}
              search={detailSearch}
              className="font-medium hover:underline"
            >
              {r.name}
            </Link>
            {total > 0 && <Badge variant="destructive">★ Unchecked</Badge>}
          </span>
        );
      },
    },
    {
      id: "printings",
      accessorFn: (r) => r.shortCodes.length,
      header: ({ column }) => <SortableHeader column={column} label="Printings" />,
      enableGlobalFilter: false,
      cell: ({ row }) => {
        const codes = formatShortCodesArray(row.original.shortCodes);
        return <span className="text-muted-foreground">{codes.join(", ")}</span>;
      },
    },
    // Marketplace data is admin-only (the endpoint 403s for card-review
    // grant holders), so the column disappears for them entirely.
    ...(isAdmin
      ? [
          {
            id: "marketplaces",
            accessorFn: (r) => coverageSortValue(coverageBySlug.get(r.cardSlug ?? "")),
            header: ({ column }) => <SortableHeader column={column} label="Marketplaces" />,
            enableGlobalFilter: false,
            sortFn: "basic",
            cell: ({ row }) => (
              <MarketplaceCoverageBadges
                coverage={coverageBySlug.get(row.original.cardSlug ?? "")}
              />
            ),
          } satisfies ColumnDef<AdminCardTableFeatures, Row>,
        ]
      : []),
    {
      id: "candidatePrintings",
      // Only favorite-source candidates are listed: with many sources enabled
      // the non-favorite codes drown out the ones that are actually
      // actionable (the accept button only ever takes favorites anyway).
      accessorFn: (r) => r.favoriteStagingShortCodes.length,
      header: ({ column }) => <SortableHeader column={column} label="Candidate Printings" />,
      enableGlobalFilter: false,
      cell: ({ row }) => {
        const codes = formatShortCodesArray(row.original.favoriteStagingShortCodes);
        const favoriteCount = row.original.favoriteStagingShortCodes.length;
        // The codes above are favorites-and-unchecked only, while the detail
        // page shows every unlinked candidate printing as a "New:" group. Name
        // the difference so a row that looks empty here but violet there is
        // explained instead of looking like a bug.
        const otherUnlinked = row.original.unlinkedPrintingCount - favoriteCount;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {codes.map((code, index) => (
                <span key={`${code}-${index}`}>
                  {code}
                  {index < codes.length - 1 && <span className="text-muted-foreground/50">, </span>}
                </span>
              ))}
            </span>
            {otherUnlinked > 0 && (
              <span
                className="text-muted-foreground/70 text-xs"
                title={`${otherUnlinked} more unlinked candidate printing${otherUnlinked === 1 ? "" : "s"} (already checked, or from a non-favorite source)`}
              >
                +{otherUnlinked} other
              </span>
            )}
            {isAdmin && row.original.cardSlug && favoriteCount > 0 && (
              <AcceptFavoriteButton cardSlug={row.original.cardSlug} count={favoriteCount} />
            )}
          </span>
        );
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AcceptedCardsTable({
  data,
  coverageBySlug,
  assignBucketsBySlug,
  isAdmin,
}: {
  data: Row[];
  coverageBySlug: Map<string, CardCoverage>;
  assignBucketsBySlug: Map<string, PriceAssignBucket[]>;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [acceptAllProgress, setAcceptAllProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const navigate = useNavigate({ from: CardsRoute.fullPath });
  const { sorting, globalFilter, setSlug, activeStatus, priceScope } = CardsRoute.useSearch({
    select: (s) => ({
      sorting: parseSortParam(s.tableSort),
      globalFilter: s.q ?? "",
      setSlug: s.set,
      activeStatus: s.status ?? null,
      priceScope: s.priceScope ?? ALL_ASSIGNABLE_SCOPE,
    }),
  });

  const priceFilterActive = activeStatus === "prices-to-assign";
  // "unchecked" stays on the list: the detail page has its own flow for it.
  const detailStatus: AdminCardListStatus | undefined =
    activeStatus === "prices-to-assign" || activeStatus === "new-printings"
      ? activeStatus
      : undefined;
  const columns = buildColumns(
    coverageBySlug,
    setSlug,
    detailStatus,
    priceFilterActive && priceScope !== ALL_ASSIGNABLE_SCOPE ? priceScope : undefined,
    isAdmin,
  );

  const uncheckedCount = data.filter(
    (r) => r.uncheckedCardCount + r.uncheckedPrintingCount > 0,
  ).length;

  // Cards the detail page would show at least one violet "New:" group for:
  // a candidate printing that no accepted printing claims yet.
  const newPrintingsCount = data.filter((r) => r.unlinkedPrintingCount > 0).length;

  // Shared with the detail page's prev/next so a run started from this filter
  // visits exactly the rows shown here.
  function matchesScope(slug: string | null, scope: string): boolean {
    return bucketsMatchScope(slug ? assignBucketsBySlug.get(slug) : undefined, scope);
  }

  // Scope options for the picker: the umbrella, then every (source, language)
  // bucket present in the current data, each with its card count. Built from the
  // visible `data` so the counts track the active set filter.
  const scopeCardCounts = new Map<string, number>();
  for (const row of data) {
    const buckets = row.cardSlug ? assignBucketsBySlug.get(row.cardSlug) : undefined;
    if (!buckets) {
      continue;
    }
    const seen = new Set<string>();
    for (const bucket of buckets) {
      if (bucket.unbound === 0) {
        continue;
      }
      const key = bucketScopeKey(bucket);
      if (!seen.has(key)) {
        seen.add(key);
        scopeCardCounts.set(key, (scopeCardCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const allAssignableCount = data.filter((r) =>
    matchesScope(r.cardSlug, ALL_ASSIGNABLE_SCOPE),
  ).length;

  // CM / TCG first, then CardTrader buckets sorted by language code.
  const scopeOrder = (key: string) => {
    if (key.startsWith("cardmarket")) {
      return `0:${key}`;
    }
    if (key.startsWith("tcgplayer")) {
      return `1:${key}`;
    }
    return `2:${key}`;
  };
  const scopeOptions = [
    {
      value: ALL_ASSIGNABLE_SCOPE,
      label: scopeLabel(ALL_ASSIGNABLE_SCOPE),
      count: allAssignableCount,
    },
    ...[...scopeCardCounts.keys()]
      .toSorted((a, b) => scopeOrder(a).localeCompare(scopeOrder(b)))
      .map((key) => ({ value: key, label: scopeLabel(key), count: scopeCardCounts.get(key) ?? 0 })),
  ];
  const selectItems = scopeOptions.map((o) => ({
    value: o.value,
    label: `${o.label} (${o.count})`,
  }));

  // Any card with at least one unbound entry (so the toggle appears even when
  // the only buckets are un-assignable noise the umbrella count hides).
  const pricesToAssignTotal = scopeCardCounts.size > 0;
  const activeScopeCount = data.filter((r) => matchesScope(r.cardSlug, priceScope)).length;

  function matchesStatus(row: Row): boolean {
    if (activeStatus === "unchecked") {
      return row.uncheckedCardCount + row.uncheckedPrintingCount > 0;
    }
    if (activeStatus === "new-printings") {
      return row.unlinkedPrintingCount > 0;
    }
    if (activeStatus === "prices-to-assign") {
      return matchesScope(row.cardSlug, priceScope);
    }
    return true;
  }

  const filteredData = activeStatus ? data.filter((row) => matchesStatus(row)) : data;

  function toggleStatus(status: NonNullable<typeof activeStatus>) {
    void navigate({
      search: (prev) => ({ ...prev, status: activeStatus === status ? undefined : status }),
      replace: true,
    });
  }

  // Picking a scope also activates the prices-to-assign filter. The umbrella
  // scope is stored as an absent param so the URL stays clean by default.
  function changePriceScope(value: string | null) {
    void navigate({
      search: (prev) => ({
        ...prev,
        status: "prices-to-assign",
        priceScope: value && value !== ALL_ASSIGNABLE_SCOPE ? value : undefined,
      }),
      replace: true,
    });
  }

  const acceptAll = useMutation({
    mutationFn: async (slugs: string[]) => {
      let done = 0;
      let failed = 0;
      setAcceptAllProgress({ done: 0, total: slugs.length });

      for (const slug of slugs) {
        try {
          await acceptFavoritePrintingsFn({ data: slug });
        } catch {
          failed++;
        }
        done++;
        setAcceptAllProgress({ done, total: slugs.length });
      }

      setAcceptAllProgress(null);
      return { accepted: done - failed, failed };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.cards.all] });
      if (result.failed === 0) {
        toast.success(`Accepted printings for ${result.accepted} cards`);
      } else {
        toast.warning(`Accepted ${result.accepted}, failed ${result.failed}`);
      }
    },
  });

  const { handleSortingChange, handleGlobalFilterChange } = useAdminCardsTableUrlSync(
    sorting,
    globalFilter,
  );

  const table = useTable({
    features: adminCardTableFeatures,
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: handleGlobalFilterChange,
    getRowId: (r) => r.cardSlug ?? r.normalizedName,
    globalFilterFn: (row, _columnId, filterValue) => {
      const r = row.original;
      return matchesCardQuery(filterValue as string, [
        r.name,
        ...r.shortCodes,
        // Matches only what the Candidate Printings column shows, so a hit
        // never lands on a row with an apparently empty column.
        ...r.favoriteStagingShortCodes,
      ]);
    },
  });

  const rows = table.getRowModel().rows;

  // Count cards that have the accept button
  const acceptableCount = data.filter(
    (r) => r.cardSlug && r.favoriteStagingShortCodes.length > 0,
  ).length;

  const { tableAnchorRef, virtualItems, totalSize, scrollMargin } = useVirtualizedTableRows(
    rows.length,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearchInput
          urlValue={globalFilter}
          onCommit={handleGlobalFilterChange}
          placeholder="Search by name or code…"
          className="w-56"
        />

        {uncheckedCount > 0 && (
          <Button
            variant={activeStatus === "unchecked" ? "default" : "outline"}
            onClick={() => toggleStatus("unchecked")}
          >
            ★ Unchecked ({uncheckedCount})
          </Button>
        )}

        {newPrintingsCount > 0 && (
          <Button
            variant={activeStatus === "new-printings" ? "default" : "outline"}
            onClick={() => toggleStatus("new-printings")}
          >
            New printings ({newPrintingsCount})
          </Button>
        )}

        {isAdmin && pricesToAssignTotal && (
          <>
            <Button
              variant={activeStatus === "prices-to-assign" ? "default" : "outline"}
              onClick={() => toggleStatus("prices-to-assign")}
            >
              Prices to assign ({activeScopeCount})
            </Button>
            {activeStatus === "prices-to-assign" && (
              <Select items={selectItems} value={priceScope} onValueChange={changePriceScope}>
                <SelectTrigger aria-label="Price source scope" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        )}

        <p className="text-muted-foreground">
          {rows.length} of {data.length} cards
          {isAdmin && acceptableCount > 0 && (
            <span className="ml-2 text-orange-600">
              ({acceptableCount} with pending ★ printings)
            </span>
          )}
        </p>

        {isAdmin && acceptableCount > 0 && (
          <Button
            variant="outline"
            disabled={acceptAll.isPending}
            onClick={() => {
              const slugs = data
                .filter((r): r is Row & { cardSlug: string } =>
                  Boolean(r.cardSlug && r.favoriteStagingShortCodes.length > 0),
                )
                .map((r) => r.cardSlug);
              acceptAll.mutate(slugs);
            }}
          >
            {acceptAll.isPending ? (
              <>
                <LoaderIcon className="size-3 animate-spin" />
                {acceptAllProgress ? `${acceptAllProgress.done}/${acceptAllProgress.total}` : "..."}
              </>
            ) : (
              <>
                <StarIcon className="size-3" />
                Accept all ({acceptableCount})
              </>
            )}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">No cards found.</p>
      ) : (
        <VirtualizedAdminCardTable
          table={table}
          rows={rows}
          virtualItems={virtualItems}
          totalSize={totalSize}
          scrollMargin={scrollMargin}
          tableAnchorRef={tableAnchorRef}
          columnWidths={COLUMN_WIDTHS}
        />
      )}
    </div>
  );
}
