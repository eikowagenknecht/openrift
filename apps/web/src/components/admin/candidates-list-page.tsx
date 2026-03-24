import type { CandidateCardSummaryResponse } from "@openrift/shared";
import { formatShortCodes } from "@openrift/shared/utils";
import { Link } from "@tanstack/react-router";
import type { ColumnDef, ColumnFiltersState, FilterFn, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
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
import { useState } from "react";
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
  useAllCards,
  useAutoCheckCandidates,
  useCandidateList,
  useLinkCard,
} from "@/hooks/use-candidates";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Status filter
// ---------------------------------------------------------------------------

type StatusFilter = "unchecked" | "unmatched" | "matched";

const statusFilterFn: FilterFn<CandidateCardSummaryResponse> = (row, _columnId, filterValue) => {
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
        onSearch={setSearch}
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

function SortableHeader({
  column,
  label,
}: {
  column: {
    getCanSort: () => boolean;
    getIsSorted: () => false | "asc" | "desc";
    getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
  };
  label: string;
}) {
  const canSort = column.getCanSort();
  const sorted = column.getIsSorted();
  if (!canSort) {
    return label;
  }
  return (
    <button
      type="button"
      className="inline-flex cursor-pointer select-none items-center gap-1"
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      {sorted ? (
        sorted === "asc" ? (
          <ArrowUpIcon className="inline h-3.5 w-3.5 text-foreground" />
        ) : (
          <ArrowDownIcon className="inline h-3.5 w-3.5 text-foreground" />
        )
      ) : (
        <ChevronsUpDownIcon className="inline h-3.5 w-3.5 text-muted-foreground/50" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function CandidatesListPage() {
  const { data } = useCandidateList();
  const autoCheck = useAutoCheckCandidates();
  const linkCard = useLinkCard();
  const acceptGallery = useAcceptGallery();
  const { data: allCards } = useAllCards();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const counts = {
    unchecked: data.filter((r) => r.uncheckedCardCount + r.uncheckedPrintingCount > 0).length,
    unmatched: data.filter((r) => !r.cardSlug).length,
    matched: data.filter((r) => r.cardSlug).length,
  };

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

  const columns: ColumnDef<CandidateCardSummaryResponse>[] = [
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
      cell: ({ row }) => {
        const r = row.original;
        const suggestedCardId =
          !r.cardSlug && r.stagingShortCodes.length > 0
            ? r.stagingShortCodes[0].replace(/(?<=\d)[a-z*]+$/, "")
            : null;
        return (
          <>
            <Link
              to={r.cardSlug ? "/admin/cards/$cardSlug" : "/admin/cards/new/$name"}
              params={r.cardSlug ? { cardSlug: r.cardSlug } : { name: r.normalizedName }}
              className="font-medium hover:underline"
            >
              {(r.cardSlug || suggestedCardId) && (
                <span className={r.cardSlug ? "text-muted-foreground" : "text-muted-foreground/40"}>
                  {r.cardSlug ?? suggestedCardId}
                </span>
              )}{" "}
              {r.name}
            </Link>
            {!r.cardSlug && r.suggestedCardSlug && (
              <Button
                variant="outline"
                size="sm"
                className="ml-2 h-5 text-xs"
                disabled={linkCard.isPending}
                onClick={() => {
                  const slug = r.suggestedCardSlug;
                  if (slug) {
                    linkCard.mutate({ name: r.normalizedName, cardId: slug });
                  }
                }}
              >
                <LinkIcon className="size-3" />
                {r.suggestedCardSlug}
              </Button>
            )}
            {!r.cardSlug && r.hasGallery && (
              <Button
                variant="outline"
                size="sm"
                className="ml-2 h-5 text-xs"
                disabled={acceptGallery.isPending}
                onClick={() => acceptGallery.mutate(r.normalizedName)}
              >
                {acceptGallery.isPending ? (
                  <LoaderIcon className="size-3 animate-spin" />
                ) : (
                  <ImagePlusIcon className="size-3" />
                )}
                Accept gallery
              </Button>
            )}
            {!r.cardSlug && allCards && (
              <AssignButton
                normalizedName={r.normalizedName}
                allCards={allCards}
                linkCard={linkCard}
              />
            )}
          </>
        );
      },
    },
    {
      id: "printings",
      header: "Printings",
      enableSorting: false,
      enableGlobalFilter: false,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span>
            {r.shortCodes.length > 0 && (
              <>
                {formatShortCodes(r.shortCodes)
                  .split(", ")
                  .map((id, i, arr) => (
                    <span key={id} className="text-muted-foreground">
                      {id}
                      {(i < arr.length - 1 || r.stagingShortCodes.length > 0) && ", "}
                    </span>
                  ))}
              </>
            )}
            {r.stagingShortCodes.length > 0 && (
              <>
                {formatShortCodes(r.stagingShortCodes)
                  .split(", ")
                  .map((id, i, arr) => (
                    <span key={`s-${id}`} className="italic text-muted-foreground/50">
                      {id}
                      {i < arr.length - 1 && ", "}
                    </span>
                  ))}
              </>
            )}
          </span>
        );
      },
    },
    {
      id: "candidates",
      accessorKey: "candidateCount",
      header: ({ column }) => <SortableHeader column={column} label="Candidates" />,
      enableGlobalFilter: false,
      cell: ({ row }) => <Badge variant="secondary">{row.original.candidateCount}</Badge>,
    },
  ];

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
  });

  const rows = table.getRowModel().rows;

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
          <SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 w-48 pl-8 text-sm"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No candidates found.</p>
      ) : (
        <div className="[&>[data-slot=table-container]]:overflow-visible">
          <Table>
            <TableHeader>
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
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(cell.column.id === "printings" && "whitespace-normal")}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
