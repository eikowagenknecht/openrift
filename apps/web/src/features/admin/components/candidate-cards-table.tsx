import { matchesCardQuery } from "@openrift/shared/card-search";
import type { CandidateCardSummaryResponse } from "@openrift/shared/types/api/admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import { ImagePlusIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminCardTableFeatures } from "@/features/admin/components/admin-card-table-shared";
import {
  adminCardTableFeatures,
  useAdminCardsTableUrlSync,
  useVirtualizedTableRows,
  VirtualizedAdminCardTable,
} from "@/features/admin/components/admin-card-table-shared";
import type { CardNameCellMeta } from "@/features/admin/components/card-name-cell";
import { CardNameCell } from "@/features/admin/components/card-name-cell";
import { DebouncedSearchInput } from "@/features/admin/components/debounced-search-input";
import { PrintingsCell } from "@/features/admin/components/printings-cell";
import { SortableHeader } from "@/features/admin/components/sortable-header";
import {
  acceptFavoritesFn,
  useAcceptFavoriteNewCard,
  useLinkCard,
} from "@/features/admin/hooks/use-admin-card-mutations";
import { useAllCards } from "@/features/admin/hooks/use-admin-card-queries";
import { parseSortParam } from "@/features/admin/lib/admin-cards-search";
import { adminKeys } from "@/features/admin/lib/admin-query-keys";

const cardsRouteApi = getRouteApi("/_app/_authenticated/admin/cards");

type StatusFilter = "unchecked";

type Row = CandidateCardSummaryResponse;

function makeColumns(meta: CardNameCellMeta): ColumnDef<AdminCardTableFeatures, Row>[] {
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

const COLUMN_WIDTHS: Record<string, string> = {
  name: "60%",
  candidates: "120px",
};

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
      void queryClient.invalidateQueries({ queryKey: [...adminKeys.cards.all] });
      if (result.failed === 0) {
        toast.success(`Accepted ${result.accepted} new cards`);
      } else {
        toast.warning(`Accepted ${result.accepted}, failed ${result.failed}`);
      }
    },
  });

  const navigate = cardsRouteApi.useNavigate();
  const { sorting, globalFilter, activeStatus, activeSource } = cardsRouteApi.useSearch({
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

  const table = useTable({
    features: adminCardTableFeatures,
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: handleGlobalFilterChange,
    getRowId: (r) => r.name,
    globalFilterFn: (row, _columnId, filterValue) =>
      matchesCardQuery(filterValue as string, [row.original.name]),
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
