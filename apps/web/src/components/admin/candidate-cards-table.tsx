import type { CandidateCardSummaryResponse } from "@openrift/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ImagePlusIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  useAdminCardsTableUrlSync,
  useVirtualizedTableRows,
  VirtualizedAdminCardTable,
} from "@/components/admin/admin-card-table-shared";
import type { CardNameCellMeta } from "@/components/admin/card-name-cell";
import { CardNameCell } from "@/components/admin/card-name-cell";
import { DebouncedSearchInput } from "@/components/admin/debounced-search-input";
import { PrintingsCell } from "@/components/admin/printings-cell";
import { SortableHeader } from "@/components/admin/sortable-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  acceptFavoritesFn,
  useAcceptFavoriteNewCard,
  useLinkCard,
} from "@/hooks/use-admin-card-mutations";
import { useAllCards } from "@/hooks/use-admin-card-queries";
import { parseSortParam } from "@/lib/admin-cards-search";
import { queryKeys } from "@/lib/query-keys";
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
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CardNameCell row={r} meta={meta} />
            {r.hasFavorite && <Badge>favorite</Badge>}
            {r.hasUserSubmission && <Badge variant="outline">user submission</Badge>}
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
// The Card cell holds the name plus Accept / Assign buttons and the favorite
// and Unchecked badges, so give it the bulk of the row; the Printings column
// only shows comma-separated short codes and can live on the remainder.
// ---------------------------------------------------------------------------

const COLUMN_WIDTHS: Record<string, string> = {
  name: "60%",
  candidates: "120px",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CandidateCardsTable({ data, isAdmin }: { data: Row[]; isAdmin: boolean }) {
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
  const { sorting, globalFilter, activeStatus, activeSource } = CardsRoute.useSearch({
    select: (s) => ({
      sorting: parseSortParam(s.tableSort),
      globalFilter: s.q ?? "",
      activeStatus: s.status ?? null,
      activeSource: s.source ?? null,
    }),
  });

  const uncheckedCount = data.filter(
    (r) => r.uncheckedCardCount + r.uncheckedPrintingCount > 0,
  ).length;

  const userSubmissionCount = data.filter((r) => r.hasUserSubmission).length;

  const acceptableCount = data.filter((r) => !r.cardSlug && r.hasFavorite).length;

  const filteredData = data.filter((r) => {
    if (activeStatus === "unchecked" && r.uncheckedCardCount + r.uncheckedPrintingCount === 0) {
      return false;
    }
    if (activeSource === "usersubmission" && !r.hasUserSubmission) {
      return false;
    }
    return true;
  });

  function toggleStatus(status: StatusFilter) {
    void navigate({
      search: (prev) => ({
        ...prev,
        status: activeStatus === status ? undefined : status,
      }),
      replace: true,
    });
  }

  function toggleSource() {
    void navigate({
      search: (prev) => ({
        ...prev,
        source: activeSource === "usersubmission" ? undefined : "usersubmission",
      }),
      replace: true,
    });
  }

  const { handleSortingChange, handleGlobalFilterChange } = useAdminCardsTableUrlSync(
    sorting,
    globalFilter,
  );

  const columns = makeColumns({ linkCard, acceptFavorite, allCards, isAdmin });

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

  const { tableAnchorRef, virtualItems, totalSize, scrollMargin } = useVirtualizedTableRows(
    rows.length,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearchInput
          urlValue={globalFilter}
          onCommit={handleGlobalFilterChange}
          placeholder="Search by name…"
          className="w-48"
        />

        <Button
          variant={activeStatus === "unchecked" ? "default" : "outline"}
          onClick={() => toggleStatus("unchecked")}
        >
          ★ Unchecked ({uncheckedCount})
        </Button>

        {userSubmissionCount > 0 && (
          <Button
            variant={activeSource === "usersubmission" ? "default" : "outline"}
            onClick={toggleSource}
          >
            User submissions ({userSubmissionCount})
          </Button>
        )}

        {isAdmin && acceptableCount > 0 && (
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
