import type { CandidateCardSummaryResponse } from "@openrift/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef, SortingState, Updater } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
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
import { useVirtualizerFresh } from "@/lib/virtualizer-fresh";
import { Route as CardsRoute } from "@/routes/_app/_authenticated/admin/cards";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = "unchecked";

type Row = CandidateCardSummaryResponse;

// ---------------------------------------------------------------------------
// Column definitions (dependencies passed via closure over meta)
// ---------------------------------------------------------------------------

function makeColumns(meta: CardNameCellMeta): ColumnDef<Row>[] {
  return [
    {
      id: "name",
      accessorFn: (r) => r.name,
      header: ({ column }) => <SortableHeader column={column} label="Card" />,
      enableGlobalFilter: true,
      cell: ({ row }) => {
        const r = row.original;
        const total = r.uncheckedCardCount + r.uncheckedPrintingCount;
        return (
          <span className="flex flex-wrap items-center gap-2">
            <CardNameCell row={r} meta={meta} />
            {r.hasFavorite && <Badge>favorite</Badge>}
            {total > 0 && <Badge variant="destructive">★ Unchecked</Badge>}
          </span>
        );
      },
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
// Column widths (applied with table-layout: fixed so filtering doesn't reflow).
// Matches accepted-cards-table: Card column first at 25%, printings fills the
// remainder, and the trailing numeric column takes a fixed 120px.
// ---------------------------------------------------------------------------

const COLUMN_WIDTHS: Record<string, string> = {
  name: "25%",
  candidates: "120px",
};

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

  const uncheckedCount = data.filter(
    (r) => r.uncheckedCardCount + r.uncheckedPrintingCount > 0,
  ).length;

  const acceptableCount = data.filter((r) => !r.cardSlug && r.hasFavorite).length;

  const filteredData =
    activeStatus === "unchecked"
      ? data.filter((r) => r.uncheckedCardCount + r.uncheckedPrintingCount > 0)
      : data;

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

  // Debounce URL commits so each keystroke doesn't re-run the route loader
  // and re-filter the full table.
  const [searchInput, setSearchInput] = useSearchUrlSync({
    urlValue: globalFilter,
    onCommit: (value) => handleGlobalFilterChange(value),
  });

  const columns = makeColumns({ linkCard, acceptFavorite, allCards });

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: handleGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (r) => r.name,
    // See accepted-cards-table.tsx for why this is needed: react-table's
    // autoResetPageIndex cascade re-renders the component at ~5Hz idle.
    autoResetPageIndex: false,
    globalFilterFn: "includesString",
  });

  const rows = table.getRowModel().rows;

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
            placeholder="Search by name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 w-48 pl-8 text-sm"
          />
        </div>

        <Button
          variant={activeStatus === "unchecked" ? "default" : "outline"}
          onClick={() => toggleStatus("unchecked")}
        >
          ★ Unchecked ({uncheckedCount})
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
      </div>

      <p className="text-muted-foreground">
        Showing {rows.length} of {data.length} candidates
      </p>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">No candidates found.</p>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="absolute inset-0 overflow-auto">
            <Table className="min-w-[720px] table-fixed">
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
