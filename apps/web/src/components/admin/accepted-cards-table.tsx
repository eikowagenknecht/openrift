import type { CandidateCardSummaryResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { LoaderIcon, SearchIcon, StarIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

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
import { useAcceptFavoritePrintings } from "@/hooks/use-admin-card-mutations";
import { cn } from "@/lib/utils";

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
// Column definitions
// ---------------------------------------------------------------------------

const columns: ColumnDef<Row>[] = [
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
            <span className="text-muted-foreground">{slug}</span> {r.name}
          </Link>
          {total > 0 && <Badge variant="destructive">Review</Badge>}
        </span>
      );
    },
  },
  {
    id: "printings",
    header: "Printings",
    enableSorting: false,
    enableGlobalFilter: false,
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <PrintingsCell row={row.original} />
        {row.original.cardSlug && row.original.hasFavoriteStagingPrintings && (
          <AcceptFavoriteButton cardSlug={row.original.cardSlug} />
        )}
      </span>
    ),
  },
];

// ---------------------------------------------------------------------------
// Virtualizer constants
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 41;
const OVERSCAN = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AcceptedCardsTable({ data }: { data: Row[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (r) => r.cardSlug ?? r.normalizedName,
    globalFilterFn: "includesString",
  });

  const rows = table.getRowModel().rows;

  // Count cards that have the accept button
  const acceptableCount = data.filter((r) => r.cardSlug && r.hasFavoriteStagingPrintings).length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground">
          {rows.length} of {data.length} cards
          {acceptableCount > 0 && (
            <span className="ml-2 text-orange-600">
              ({acceptableCount} with pending ★ printings)
            </span>
          )}
        </p>

        <div className="relative ml-auto">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            placeholder="Search by name…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 w-48 pl-8 text-sm"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">No cards found.</p>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
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
              {virtualizer.getVirtualItems().length > 0 && (
                <tr style={{ height: virtualizer.getVirtualItems()[0].start }} />
              )}
              {virtualizer.getVirtualItems().map((virtualRow) => {
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
              {virtualizer.getVirtualItems().length > 0 && (
                <tr
                  style={{
                    height:
                      virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                  }}
                />
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
