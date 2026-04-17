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
} from "@tanstack/react-table";
import { LoaderIcon, SearchIcon, StarIcon } from "lucide-react";
import { useRef, useState } from "react";
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
import { parseSortParam, stringifySort } from "@/lib/admin-cards-search";
import type { CardCoverage, MarketplaceCoverage } from "@/lib/marketplace-coverage";
import { queryKeys } from "@/lib/query-keys";
import { useRcTable, useRcVirtualizer } from "@/lib/react-compiler-interop";
import { cn } from "@/lib/utils";
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

const COVERAGE_BADGE_CLASS: Record<MarketplaceCoverage["status"], string> = {
  full: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  none: "border-destructive/30 bg-destructive/10 text-destructive",
  na: "border-muted text-muted-foreground",
};

function MarketplaceCoverageBadge({
  shortName,
  fullLabel,
  coverage,
}: {
  shortName: string;
  fullLabel: string;
  coverage: MarketplaceCoverage;
}) {
  const tooltip =
    coverage.status === "na"
      ? `${fullLabel}: not applicable for this card`
      : `${fullLabel}: ${coverage.mapped}/${coverage.total} mapped`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            className={cn(
              "h-5 px-1.5 font-mono text-[10px]",
              COVERAGE_BADGE_CLASS[coverage.status],
            )}
          >
            {shortName}
          </Badge>
        }
      />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function MarketplaceCoverageBadges({ coverage }: { coverage: CardCoverage | undefined }) {
  if (!coverage) {
    return <span className="text-muted-foreground/50 text-xs">—</span>;
  }
  return (
    <span className="flex items-center gap-1">
      <MarketplaceCoverageBadge
        shortName="TCG"
        fullLabel="TCGplayer"
        coverage={coverage.tcgplayer}
      />
      <MarketplaceCoverageBadge
        shortName="CM"
        fullLabel="Cardmarket"
        coverage={coverage.cardmarket}
      />
      <MarketplaceCoverageBadge
        shortName="CT"
        fullLabel="CardTrader"
        coverage={coverage.cardtrader}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sort weighting for the marketplace coverage column
// ---------------------------------------------------------------------------

// Sort partially-mapped cards highest so admins see the work-in-progress
// rows first, then unmapped, then n/a, then fully-mapped (least urgent).
const STATUS_WEIGHT: Record<MarketplaceCoverage["status"], number> = {
  partial: 0,
  none: 1,
  na: 2,
  full: 3,
};

function coverageSortValue(coverage: CardCoverage | undefined): number {
  if (!coverage) {
    return 99;
  }
  return (
    STATUS_WEIGHT[coverage.tcgplayer.status] * 100 +
    STATUS_WEIGHT[coverage.cardmarket.status] * 10 +
    STATUS_WEIGHT[coverage.cardtrader.status]
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function buildColumns(coverageBySlug: Map<string, CardCoverage>): ColumnDef<Row>[] {
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
              className="font-medium hover:underline"
            >
              {r.name}
            </Link>
            {total > 0 && <Badge variant="destructive">Review</Badge>}
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

  const columns = buildColumns(coverageBySlug);

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

  const navigate = useNavigate({ from: CardsRoute.fullPath });
  const sorting = CardsRoute.useSearch({ select: (s) => parseSortParam(s.sort) });
  const [globalFilter, setGlobalFilter] = useState("");

  function handleSortingChange(updater: Updater<SortingState>) {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    void navigate({
      search: (prev) => ({ ...prev, sort: stringifySort(next) }),
      replace: true,
    });
  }

  const table = useRcTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (r) => r.cardSlug ?? r.normalizedName,
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
  const { virtualItems, totalSize } = useRcVirtualizer({
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
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 w-56 pl-8 text-sm"
          />
        </div>

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
            <Table>
              <TableHeader className="sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
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
