import type { CandidateCardSummaryResponse } from "@openrift/shared";
import { formatShortCodesArray } from "@openrift/shared/utils";
import { Link } from "@tanstack/react-router";
import type {
  Column,
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  SortingState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCheckIcon,
  ChevronsUpDownIcon,
  ImagePlusIcon,
  LinkIcon,
  LoaderIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
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
  useAcceptGallery,
  useAdminCardList,
  useAllCards,
  useAutoCheckCandidates,
  useLinkCard,
} from "@/hooks/use-admin-cards";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = "unchecked" | "unmatched" | "matched";

type Row = CandidateCardSummaryResponse;

interface TableMeta {
  linkCard: ReturnType<typeof useLinkCard>;
  acceptGallery: ReturnType<typeof useAcceptGallery>;
  allCards: { slug: string; name: string; type: string }[];
}

// ---------------------------------------------------------------------------
// Status filter
// ---------------------------------------------------------------------------

const statusFilterFn: FilterFn<Row> = (row, _columnId, filterValue) => {
  const value = filterValue as StatusFilter | undefined;
  if (!value) {
    return true;
  }
  const r = row.original;
  switch (value) {
    case "unchecked": {
      return r.uncheckedCardCount + r.uncheckedPrintingCount > 0;
    }
    case "unmatched": {
      return !r.cardSlug;
    }
    case "matched": {
      return Boolean(r.cardSlug);
    }
  }
};

// ---------------------------------------------------------------------------
// Assign button (inline card search)
// ---------------------------------------------------------------------------

function AssignButton({
  normalizedName,
  allCards,
  linkCard,
}: {
  normalizedName: string;
  allCards: { slug: string; name: string; type: string }[];
  linkCard: ReturnType<typeof useLinkCard>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(query: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setSearch(query);
    }, 150);
  }

  const results: CardSearchResult[] =
    search.length >= 2
      ? allCards
          .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 20)
          .map((c) => ({ id: c.slug, label: c.name, sublabel: c.slug, detail: c.type }))
      : [];

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="ml-2 h-5 text-xs"
        onClick={() => setOpen(true)}
      >
        <LinkIcon className="size-3" />
        Assign
      </Button>
    );
  }

  return (
    <>
      <CardSearchDropdown
        results={results}
        onSearch={handleSearch}
        onSelect={(cardId) => {
          linkCard.mutate({ name: normalizedName, cardId });
          setOpen(false);
          setSearch("");
        }}
        placeholder="Search by name…"
        className="ml-2 inline-flex w-48 [&_input]:h-5 [&_input]:py-0 [&_input]:text-xs"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only UI, autofocus is intentional
        autoFocus
      />
      <Button
        variant="ghost"
        size="sm"
        className="ml-1 h-5 text-xs"
        onClick={() => {
          setOpen(false);
          setSearch("");
        }}
      >
        <XIcon className="size-3" />
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sort header helper
// ---------------------------------------------------------------------------

function SortableHeader({ column, label }: { column: Column<Row>; label: string }) {
  const canSort = column.getCanSort();
  const sorted = column.getIsSorted();
  if (!canSort) {
    return label;
  }
  return (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-1 select-none"
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      {sorted ? (
        sorted === "asc" ? (
          <ArrowUpIcon className="text-foreground inline h-3.5 w-3.5" />
        ) : (
          <ArrowDownIcon className="text-foreground inline h-3.5 w-3.5" />
        )
      ) : (
        <ChevronsUpDownIcon className="text-muted-foreground/50 inline h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card name cell
// ---------------------------------------------------------------------------

function CardNameCell({ row, meta }: { row: Row; meta: TableMeta }) {
  const { linkCard, acceptGallery, allCards } = meta;
  const suggestedCardId =
    !row.cardSlug && row.stagingShortCodes.length > 0
      ? row.stagingShortCodes[0].replace(/(?<=\d)[a-z*]+$/, "")
      : null;

  return (
    <>
      <Link
        to={row.cardSlug ? "/admin/cards/$cardSlug" : "/admin/cards/new/$name"}
        params={row.cardSlug ? { cardSlug: row.cardSlug } : { name: row.normalizedName }}
        className="font-medium hover:underline"
      >
        {(row.cardSlug || suggestedCardId) && (
          <span className={row.cardSlug ? "text-muted-foreground" : "text-muted-foreground/40"}>
            {row.cardSlug ?? suggestedCardId}
          </span>
        )}{" "}
        {row.name}
      </Link>
      {!row.cardSlug && row.suggestedCardSlug && (
        <Button
          variant="outline"
          size="sm"
          className="ml-2 h-5 text-xs"
          disabled={linkCard.isPending}
          onClick={() => {
            const slug = row.suggestedCardSlug;
            if (slug) {
              linkCard.mutate({ name: row.normalizedName, cardId: slug });
            }
          }}
        >
          <LinkIcon className="size-3" />
          {row.suggestedCardSlug}
        </Button>
      )}
      {!row.cardSlug && row.hasGallery && (
        <Button
          variant="outline"
          size="sm"
          className="ml-2 h-5 text-xs"
          disabled={acceptGallery.isPending}
          onClick={() => acceptGallery.mutate(row.normalizedName)}
        >
          {acceptGallery.isPending ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <ImagePlusIcon className="size-3" />
          )}
          Accept gallery
        </Button>
      )}
      {!row.cardSlug && allCards && (
        <AssignButton normalizedName={row.normalizedName} allCards={allCards} linkCard={linkCard} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Printings cell
// ---------------------------------------------------------------------------

function PrintingsCell({ row }: { row: Row }) {
  const shortCodes = formatShortCodesArray(row.shortCodes);
  const stagingCodes = formatShortCodesArray(row.stagingShortCodes);

  return (
    <span>
      {shortCodes.map((code, index) => (
        <span key={code} className="text-muted-foreground">
          {code}
          {(index < shortCodes.length - 1 || stagingCodes.length > 0) && ", "}
        </span>
      ))}
      {stagingCodes.map((code, index) => (
        <span key={`s-${code}`} className="text-muted-foreground/50 italic">
          {code}
          {index < stagingCodes.length - 1 && ", "}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Column definitions (stable — dependencies passed via table meta)
// ---------------------------------------------------------------------------

const columns: ColumnDef<Row>[] = [
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
          {r.cardSlug ? (
            <Badge variant="outline">Active</Badge>
          ) : (
            <Badge variant="secondary">New</Badge>
          )}
          {r.hasGallery && <Badge className="text-xs">gallery</Badge>}
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
    cell: ({ row, table }) => (
      <CardNameCell row={row.original} meta={table.options.meta as TableMeta} />
    ),
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

// ---------------------------------------------------------------------------
// Row height for virtualizer
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 41;

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function AdminCardListPage() {
  const { data } = useAdminCardList();
  const autoCheck = useAutoCheckCandidates();
  const linkCard = useLinkCard();
  const acceptGallery = useAcceptGallery();
  const { data: allCards } = useAllCards();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const counts = { unchecked: 0, unmatched: 0, matched: 0 };
  for (const r of data) {
    if (r.uncheckedCardCount + r.uncheckedPrintingCount > 0) {
      counts.unchecked++;
    }
    if (r.cardSlug) {
      counts.matched++;
    } else {
      counts.unmatched++;
    }
  }

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

  const meta: TableMeta = { linkCard, acceptGallery, allCards };

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
    getRowId: (r) => r.cardSlug ?? r.name,
    globalFilterFn: "includesString",
    meta,
  });

  const rows = table.getRowModel().rows;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={autoCheck.isPending}
          onClick={() =>
            autoCheck.mutate(undefined, {
              onSuccess: (result) => {
                const total = result.candidateCardsChecked + result.candidatePrintingsChecked;
                toast(
                  total > 0
                    ? `Auto-checked ${result.candidateCardsChecked} candidate card + ${result.candidatePrintingsChecked} candidate printing sources`
                    : "No matching unchecked candidates found",
                );
              },
            })
          }
        >
          <CheckCheckIcon />
          {autoCheck.isPending ? "Checking..." : "Auto-check matching"}
        </Button>

        {(
          [
            ["unchecked", "Review", counts.unchecked],
            ["unmatched", "New", counts.unmatched],
            ["matched", "Active", counts.matched],
          ] as const
        ).map(([f, label, count]) => (
          <Button
            key={f}
            variant={activeStatus === f ? "default" : "outline"}
            size="sm"
            onClick={() => toggleStatus(f)}
          >
            {label} ({count})
          </Button>
        ))}

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

      <p className="text-muted-foreground text-xs">
        Showing {rows.length} of {data.length} candidates
      </p>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">No candidates found.</p>
      ) : (
        <div ref={scrollRef} className="max-h-[calc(100vh-220px)] overflow-auto">
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
