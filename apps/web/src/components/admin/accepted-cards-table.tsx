import type { CandidateCardSummaryResponse } from "@openrift/shared";
import { formatShortCodesArray } from "@openrift/shared/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef, SortingState, Updater } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { LoaderIcon, SearchIcon, StarIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { SortableHeader } from "@/components/admin/sortable-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  acceptFavoritePrintingsFn,
  useAcceptFavoritePrintings,
} from "@/hooks/use-admin-card-mutations";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import { parseSortParam, stringifySort } from "@/lib/admin-cards-search";
import type {
  CardCoverage,
  DirectionCoverage,
  MarketplaceCoverage,
} from "@/lib/marketplace-coverage";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useVirtualizerFresh } from "@/lib/virtualizer-fresh";
import { Route as CardsRoute } from "@/routes/_app/_authenticated/admin/cards";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Row = CandidateCardSummaryResponse;

// ---------------------------------------------------------------------------
// Accept button component (needs hooks)
// ---------------------------------------------------------------------------

function AcceptFavoriteButton({ cardSlug }: { cardSlug: string }) {
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
      Accept
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
  return (
    <div className="relative inline-flex h-5 min-w-10 font-mono text-xs">
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              aria-label={`${fullLabel} printings status`}
              className={cn(
                "flex-1 cursor-default rounded-l-md border border-r-0",
                HALF_BG_CLASS[coverage.printings.status],
                BORDER_CLASS[coverage.printings.status],
              )}
            />
          }
        />
        <TooltipContent>
          {directionTooltip(fullLabel, "printings", coverage.printings)}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              aria-label={`${fullLabel} entries status`}
              className={cn(
                "flex-1 cursor-default rounded-r-md border border-l-0",
                HALF_BG_CLASS[coverage.entries.status],
                BORDER_CLASS[coverage.entries.status],
              )}
            />
          }
        />
        <TooltipContent>{directionTooltip(fullLabel, "entries", coverage.entries)}</TooltipContent>
      </Tooltip>
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
): ColumnDef<Row>[] {
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
          <span className="flex items-center gap-2">
            <Link
              to="/admin/cards/$cardSlug"
              params={{ cardSlug: slug }}
              search={setSlug ? { set: setSlug } : {}}
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
    {
      id: "marketplaces",
      accessorFn: (r) => coverageSortValue(coverageBySlug.get(r.cardSlug ?? "")),
      header: ({ column }) => <SortableHeader column={column} label="Marketplaces" />,
      enableGlobalFilter: false,
      sortingFn: "basic",
      cell: ({ row }) => (
        <MarketplaceCoverageBadges coverage={coverageBySlug.get(row.original.cardSlug ?? "")} />
      ),
    },
    {
      id: "candidatePrintings",
      accessorFn: (r) => r.stagingShortCodes.length,
      header: ({ column }) => <SortableHeader column={column} label="Candidate Printings" />,
      enableGlobalFilter: false,
      cell: ({ row }) => {
        const codes = formatShortCodesArray(row.original.stagingShortCodes);
        return (
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground/50 italic">{codes.join(", ")}</span>
            {row.original.cardSlug && row.original.hasFavoriteStagingPrintings && (
              <AcceptFavoriteButton cardSlug={row.original.cardSlug} />
            )}
          </span>
        );
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Virtualizer constants
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 41;
const OVERSCAN = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AcceptedCardsTable({
  data,
  coverageBySlug,
}: {
  data: Row[];
  coverageBySlug: Map<string, CardCoverage>;
}) {
  const queryClient = useQueryClient();
  const [acceptAllProgress, setAcceptAllProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const navigate = useNavigate({ from: CardsRoute.fullPath });
  const { sorting, globalFilter, setSlug, activeStatus } = CardsRoute.useSearch({
    select: (s) => ({
      sorting: parseSortParam(s.sort),
      globalFilter: s.q ?? "",
      setSlug: s.set,
      activeStatus: s.status ?? null,
    }),
  });

  const columns = buildColumns(coverageBySlug, setSlug);

  const uncheckedCount = data.filter(
    (r) => r.uncheckedCardCount + r.uncheckedPrintingCount > 0,
  ).length;

  function hasPricesToAssign(slug: string | null): boolean {
    const cov = slug ? coverageBySlug.get(slug) : undefined;
    if (!cov) {
      return false;
    }
    const status = (d: DirectionCoverage) => d.status === "partial" || d.status === "none";
    return (
      status(cov.tcgplayer.entries) ||
      status(cov.cardmarket.entries) ||
      status(cov.cardtrader.entries)
    );
  }

  const pricesToAssignCount = data.filter((r) => hasPricesToAssign(r.cardSlug)).length;

  const filteredData =
    activeStatus === "unchecked"
      ? data.filter((r) => r.uncheckedCardCount + r.uncheckedPrintingCount > 0)
      : activeStatus === "prices-to-assign"
        ? data.filter((r) => hasPricesToAssign(r.cardSlug))
        : data;

  function toggleStatus(status: NonNullable<typeof activeStatus>) {
    void navigate({
      search: (prev) => ({ ...prev, status: activeStatus === status ? undefined : status }),
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

  function handleSortingChange(updater: Updater<SortingState>) {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    void navigate({
      search: (prev) => ({ ...prev, sort: stringifySort(next) }),
      replace: true,
    });
  }

  const handleGlobalFilterChange = useCallback(
    (updater: Updater<string>) => {
      const next = typeof updater === "function" ? updater(globalFilter) : updater;
      void navigate({
        search: (prev) => ({ ...prev, q: next === "" ? undefined : next }),
        replace: true,
      });
    },
    [globalFilter, navigate],
  );

  // Input renders from local state for keystroke-level responsiveness; the
  // URL (and therefore the expensive filter + virtualizer pipeline) only
  // updates after typing pauses.
  const [searchInput, setSearchInput] = useSearchUrlSync({
    urlValue: globalFilter,
    onCommit: (value) => handleGlobalFilterChange(value),
  });

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: handleGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (r) => r.cardSlug ?? r.normalizedName,
    // react-table's default `autoResetPageIndex` queues a microtask that calls
    // `setPagination` (internal setState) after every `getCoreRowModel` /
    // `getSortedRowModel` / `getFilteredRowModel` run. With a parent that
    // re-creates the table options each render (via the setOptions call in
    // useReactTable), those memo deps look "changed" to the library's memo
    // util even when our data ref is stable, so the internal setState fires
    // on every render and cascades at ~5Hz. Opt out: we don't use pagination.
    autoResetPageIndex: false,
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = (filterValue as string).toLowerCase();
      const r = row.original;
      return (
        r.name.toLowerCase().includes(query) ||
        r.shortCodes.some((code) => code.toLowerCase().includes(query)) ||
        r.stagingShortCodes.some((code) => code.toLowerCase().includes(query))
      );
    },
  });

  const rows = table.getRowModel().rows;

  // Count cards that have the accept button
  const acceptableCount = data.filter((r) => r.cardSlug && r.hasFavoriteStagingPrintings).length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const { virtualItems, totalSize } = useVirtualizerFresh({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            placeholder="Search by name or code…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 w-56 pl-8 text-sm"
          />
        </div>

        {uncheckedCount > 0 && (
          <Button
            variant={activeStatus === "unchecked" ? "default" : "outline"}
            onClick={() => toggleStatus("unchecked")}
          >
            ★ Unchecked ({uncheckedCount})
          </Button>
        )}

        {pricesToAssignCount > 0 && (
          <Button
            variant={activeStatus === "prices-to-assign" ? "default" : "outline"}
            onClick={() => toggleStatus("prices-to-assign")}
          >
            Prices to assign ({pricesToAssignCount})
          </Button>
        )}

        <p className="text-muted-foreground">
          {rows.length} of {data.length} cards
          {acceptableCount > 0 && (
            <span className="ml-2 text-orange-600">
              ({acceptableCount} with pending ★ printings)
            </span>
          )}
        </p>

        {acceptableCount > 0 && (
          <Button
            variant="outline"
            disabled={acceptAll.isPending}
            onClick={() => {
              const slugs = data
                .filter((r): r is Row & { cardSlug: string } =>
                  Boolean(r.cardSlug && r.hasFavoriteStagingPrintings),
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
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="absolute inset-0 overflow-auto">
            <Table className="table-fixed">
              <TableHeader className="sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} style={{ width: COLUMN_WIDTHS[header.id] }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {virtualItems.length > 0 && <tr style={{ height: virtualItems[0].start }} />}
                {virtualItems.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <TableRow key={row.id} data-index={virtualRow.index}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="whitespace-normal">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                {virtualItems.length > 0 && (
                  <tr style={{ height: totalSize - (virtualItems.at(-1)?.end ?? 0) }} />
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
