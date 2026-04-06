import type { CandidateCardSummaryResponse } from "@openrift/shared";
import type { ColumnDef, ColumnFiltersState, FilterFn, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SearchIcon } from "lucide-react";
import { useRef, useState } from "react";

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
import { useAcceptGallery, useLinkCard } from "@/hooks/use-admin-card-mutations";
import { useAllCards } from "@/hooks/use-admin-card-queries";
import { cn } from "@/lib/utils";

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
            {r.hasGallery && <Badge>gallery</Badge>}
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
  const acceptGallery = useAcceptGallery();
  const { data: allCards } = useAllCards();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const uncheckedCount = data.filter(
    (r) => r.uncheckedCardCount + r.uncheckedPrintingCount > 0,
  ).length;

  const activeStatus = (columnFilters.find((f) => f.id === "status")?.value ??
    null) as StatusFilter | null;

  function toggleStatus(status: StatusFilter) {
    setColumnFilters((prev) => {
      const without = prev.filter((f) => f.id !== "status");
      if (activeStatus === status) {
        return without;
      }
      return [...without, { id: "status", value: status }];
    });
  }

  const columns = makeColumns({ linkCard, acceptGallery, allCards });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (r) => r.name,
    globalFilterFn: "includesString",
  });

  const rows = table.getRowModel().rows;

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
        <Button
          variant={activeStatus === "unchecked" ? "default" : "outline"}
          onClick={() => toggleStatus("unchecked")}
        >
          Review ({uncheckedCount})
        </Button>

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
