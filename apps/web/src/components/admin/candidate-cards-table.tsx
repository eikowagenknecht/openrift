import type { CandidateCardSummaryResponse } from "@openrift/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";
import { ImagePlusIcon, LoaderIcon, SearchIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { CardNameCellMeta } from "@/components/admin/card-name-cell";
import { CardNameCell } from "@/components/admin/card-name-cell";
import { PrintingsCell } from "@/components/admin/printings-cell";
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
import {
  acceptFavoritesFn,
  useAcceptFavoriteNewCard,
  useLinkCard,
} from "@/hooks/use-admin-card-mutations";
import { useAllCards } from "@/hooks/use-admin-card-queries";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import { parseSortParam, stringifySort } from "@/lib/admin-cards-search";
import { queryKeys } from "@/lib/query-keys";
import { useRcTable, useRcVirtualizer } from "@/lib/react-compiler-interop";
import { cn } from "@/lib/utils";
import { Route as CardsRoute } from "@/routes/_app/_authenticated/admin/cards";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = "unchecked";

type Row = CandidateCardSummaryResponse;

// ---------------------------------------------------------------------------
// Status filter
// ---------------------------------------------------------------------------

const statusFilterFn: FilterFn<Row> = (row, _columnId, filterValue) => {
  const value = filterValue as StatusFilter | undefined;
  if (!value) {
    return true;
  }
  const r = row.original;
  return r.uncheckedCardCount + r.uncheckedPrintingCount > 0;
};

// ---------------------------------------------------------------------------
// Column definitions (dependencies passed via closure over meta)
// ---------------------------------------------------------------------------

function makeColumns(meta: CardNameCellMeta): ColumnDef<Row>[] {
  return [
    {
      id: "status",
      header: "Status",
      enableSorting: false,
      filterFn: statusFilterFn,
      cell: ({ row }) => {
        const r = row.original;
        const total = r.uncheckedCardCount + r.uncheckedPrintingCount;
        return (
          <div className="flex items-center gap-1">
            {r.hasFavorite && <Badge>favorite</Badge>}
            {total > 0 && <Badge variant="destructive">Review</Badge>}
          </div>
        );
      },
    },
    {
      id: "name",
      accessorFn: (r) => r.name,
      header: ({ column }) => <SortableHeader column={column} label="Card" />,
      enableGlobalFilter: true,
      cell: ({ row }) => <CardNameCell row={row.original} meta={meta} />,
    },
    {
      id: "printings",
      header: "Printings",
      enableSorting: false,
      enableGlobalFilter: false,
      cell: ({ row }) => <PrintingsCell row={row.original} />,
    },
    {
      id: "candidates",
      accessorKey: "candidateCount",
      header: ({ column }) => <SortableHeader column={column} label="Candidates" />,
      enableGlobalFilter: false,
      cell: ({ row }) => <Badge variant="secondary">{row.original.candidateCount}</Badge>,
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

export function CandidateCardsTable({ data }: { data: Row[] }) {
  const linkCard = useLinkCard();
  const acceptFavorite = useAcceptFavoriteNewCard();
  const { data: allCards } = useAllCards();
  const queryClient = useQueryClient();
  const [acceptAllProgress, setAcceptAllProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const acceptAll = useMutation({
    mutationFn: async (names: string[]) => {
      let done = 0;
      let failed = 0;
      setAcceptAllProgress({ done: 0, total: names.length });

      for (const name of names) {
        try {
          await acceptFavoritesFn({ data: { name } });
        } catch {
          failed++;
        }
        done++;
        setAcceptAllProgress({ done, total: names.length });
      }

      setAcceptAllProgress(null);
      return { accepted: done - failed, failed };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.cards.all] });
      if (result.failed === 0) {
        toast.success(`Accepted ${result.accepted} new cards`);
      } else {
        toast.warning(`Accepted ${result.accepted}, failed ${result.failed}`);
      }
    },
  });

  const navigate = useNavigate({ from: CardsRoute.fullPath });
  const { sorting, globalFilter, activeStatus } = CardsRoute.useSearch({
    select: (s) => ({
      sorting: parseSortParam(s.sort),
      globalFilter: s.q ?? "",
      activeStatus: s.status ?? null,
    }),
  });

  const columnFilters: ColumnFiltersState = activeStatus
    ? [{ id: "status", value: activeStatus }]
    : [];

  const uncheckedCount = data.filter(
    (r) => r.uncheckedCardCount + r.uncheckedPrintingCount > 0,
  ).length;

  const acceptableCount = data.filter((r) => !r.cardSlug && r.hasFavorite).length;

  function toggleStatus(status: StatusFilter) {
    void navigate({
      search: (prev) => ({
        ...prev,
        status: activeStatus === status ? undefined : status,
      }),
      replace: true,
    });
  }

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

  // Debounce URL commits so each keystroke doesn't re-run the route loader,
  // re-filter the full table, and re-mount virtualizer children.
  const [searchInput, setSearchInput] = useSearchUrlSync({
    urlValue: globalFilter,
    onCommit: (value) => handleGlobalFilterChange(value),
  });

  function handleColumnFiltersChange(updater: Updater<ColumnFiltersState>) {
    const next = typeof updater === "function" ? updater(columnFilters) : updater;
    const statusFilter = next.find((f) => f.id === "status")?.value as StatusFilter | undefined;
    void navigate({
      search: (prev) => ({ ...prev, status: statusFilter }),
      replace: true,
    });
  }

  const columns = makeColumns({ linkCard, acceptFavorite, allCards });

  const table = useRcTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    onGlobalFilterChange: handleGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (r) => r.name,
    globalFilterFn: "includesString",
  });

  const rows = table.getRowModel().rows;

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
        <Button
          variant={activeStatus === "unchecked" ? "default" : "outline"}
          onClick={() => toggleStatus("unchecked")}
        >
          Review ({uncheckedCount})
        </Button>

        {acceptableCount > 0 && (
          <Button
            variant="outline"
            disabled={acceptAll.isPending}
            onClick={() => {
              const names = data
                .filter((r) => !r.cardSlug && r.hasFavorite)
                .map((r) => r.normalizedName);
              acceptAll.mutate(names);
            }}
          >
            {acceptAll.isPending ? (
              <>
                <LoaderIcon className="size-3 animate-spin" />
                {acceptAllProgress ? `${acceptAllProgress.done}/${acceptAllProgress.total}` : "..."}
              </>
            ) : (
              <>
                <ImagePlusIcon className="size-3" />
                Accept all ({acceptableCount})
              </>
            )}
          </Button>
        )}

        <div className="relative ml-auto">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            placeholder="Search by name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 w-48 pl-8 text-sm"
          />
        </div>
      </div>

      <p className="text-muted-foreground">
        Showing {rows.length} of {data.length} candidates
      </p>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">No candidates found.</p>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        header.id === "status" && "w-28",
                        header.id === "candidates" && "w-28",
                      )}
                    >
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
                      <TableCell
                        key={cell.id}
                        className={cn(cell.column.id === "printings" && "whitespace-normal")}
                      >
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
      )}
    </div>
  );
}
