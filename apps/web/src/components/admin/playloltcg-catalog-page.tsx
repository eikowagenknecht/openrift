import { formatDay, META_CATALOG_SORTS } from "@openrift/shared";
import type { PlayloltcgCatalogRow } from "@openrift/shared/contracts/admin/meta-catalog";
import { Link } from "@tanstack/react-router";
import {
  ArchiveXIcon,
  CheckIcon,
  DownloadIcon,
  LayersIcon,
  SlidersHorizontalIcon,
  UndoIcon,
} from "lucide-react";
import { useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminPager } from "@/components/admin/admin-pager";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { MetaAutoAcceptDialog } from "@/components/admin/meta-auto-accept-dialog";
import { announceSyncTrigger } from "@/components/admin/meta-catalog-shared";
import { MetaCoverageChips } from "@/components/admin/meta-coverage-chips";
import { ConfirmActionButton } from "@/components/admin/meta-review-shared";
import { urlTriage } from "@/components/admin/meta-triage-filter";
import { PlayloltcgCatalogFilters } from "@/components/admin/playloltcg-catalog-filters";
import { PageTopBarButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PlayloltcgCatalogParams } from "@/hooks/use-admin-playloltcg-catalog";
import {
  PLAYLOLTCG_CATALOG_PAGE_SIZE,
  useAcceptPlayloltcgEvent,
  useAdminPlayloltcgCatalog,
  useDismissPlayloltcgEvent,
  useFetchPlayloltcgEvent,
  useUndismissPlayloltcgEvent,
} from "@/hooks/use-admin-playloltcg-catalog";
import { urlTableSort, useUrlTableFilters } from "@/hooks/use-url-table-filters";
import {
  catalogTriageDisplay,
  playloltcgCoverageRow,
  playloltcgStatusDisplay,
} from "@/lib/meta-catalog-display";
import { Route } from "@/routes/_app/_authenticated/admin/meta";

function DateCell({ row }: AdminCellSlotProps<PlayloltcgCatalogRow>) {
  if (!row || row.startAt === null) {
    return <span className="tabular-nums">—</span>;
  }
  return <span className="tabular-nums">{formatDay(row.startAt)}</span>;
}

function NameCell({ row }: AdminCellSlotProps<PlayloltcgCatalogRow>) {
  if (!row) {
    return null;
  }
  return (
    <a
      href={row.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="font-medium hover:underline"
      title="Open the source's page for this event"
    >
      {row.name}
    </a>
  );
}

function StatusCell({ row }: AdminCellSlotProps<PlayloltcgCatalogRow>) {
  if (!row) {
    return null;
  }
  const status = playloltcgStatusDisplay(row.status);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status && <Badge variant={status.variant}>{status.label}</Badge>}
      {row.battleMode !== null && row.battleMode !== "1v1" && (
        <Badge variant="subtle">{row.battleMode}</Badge>
      )}
      {row.missingSince !== null && (
        <Badge variant="destructive" title="Gone from the listing">
          Missing
        </Badge>
      )}
    </div>
  );
}

function PlayersCell({ row }: AdminCellSlotProps<PlayloltcgCatalogRow>) {
  return <span className="tabular-nums">{row?.playerCount ?? "—"}</span>;
}

function VenueCell({ row }: AdminCellSlotProps<PlayloltcgCatalogRow>) {
  const parts = [row?.shopName, row?.city].filter((part): part is string => Boolean(part));
  return (
    <span className="text-muted-foreground block max-w-56 truncate">
      {parts.length === 0 ? "—" : parts.join(", ")}
    </span>
  );
}

function CoverageCell({ row }: AdminCellSlotProps<PlayloltcgCatalogRow>) {
  if (!row) {
    return null;
  }
  const triage = catalogTriageDisplay(row.triage);
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant={triage.variant}>{triage.label}</Badge>
      <MetaCoverageChips row={playloltcgCoverageRow(row)} />
    </div>
  );
}

const columns: AdminColumnDef<PlayloltcgCatalogRow>[] = [
  { header: "Date", width: "w-28", sortKey: "startAt", sortFirst: "desc", cell: <DateCell /> },
  { header: "Event", sortKey: "name", cell: <NameCell /> },
  { header: "Status", cell: <StatusCell /> },
  {
    header: "Players",
    align: "right",
    width: "w-20",
    sortKey: "playerCount",
    sortFirst: "desc",
    cell: <PlayersCell />,
  },
  { header: "Venue", cell: <VenueCell /> },
  { header: "Coverage", width: "w-64", cell: <CoverageCell /> },
];

const SORT_FALLBACK = { sort: "startAt", direction: "desc" } as const;

/** What a row's buttons do, held once by the page rather than once per row. */
interface PlayloltcgRowHandlers {
  busy: boolean;
  onAccept: (activityShopId: number) => void;
  onDismiss: (activityShopId: number) => Promise<unknown>;
  onUndismiss: (activityShopId: number) => void;
  onFetch: (activityShopId: number) => void;
}

/**
 * The per-row triage actions, on the same ghost buttons and the same
 * confirmation as the uvsgames catalogue. The mutations stay on the page rather
 * than here, so a fifty-row page holds four of them instead of two hundred.
 *
 * @returns The actions for one catalogue row.
 */
function PlayloltcgRowActions({
  row,
  busy,
  onAccept,
  onDismiss,
  onUndismiss,
  onFetch,
}: AdminCellSlotProps<PlayloltcgCatalogRow> & PlayloltcgRowHandlers) {
  if (!row) {
    return null;
  }

  if (row.triage === "dismissed") {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => onUndismiss(row.activityShopId)}
      >
        <UndoIcon />
        Undismiss
      </Button>
    );
  }

  if (row.triage === "accepted") {
    return (
      <>
        {row.metaEventId !== null && (
          <Button
            variant="ghost"
            size="sm"
            render={<Link to="/admin/meta/$eventId" params={{ eventId: row.metaEventId }} />}
          >
            <LayersIcon />
            Standings
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onFetch(row.activityShopId)}
        >
          <DownloadIcon />
          Fetch now
        </Button>
      </>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => onAccept(row.activityShopId)}
      >
        <CheckIcon />
        Accept
      </Button>
      <ConfirmActionButton
        title={`Dismiss "${row.name}"?`}
        description="The event drops out of the new queue and the sync skips it from now on. You can undismiss it later."
        confirmLabel="Dismiss"
        onConfirm={() => onDismiss(row.activityShopId)}
      >
        <ArchiveXIcon />
        Dismiss
      </ConfirmActionButton>
    </>
  );
}

/**
 * The playloltcg catalogue triage list (ADR-014, second source). Built on the
 * same {@link AdminTable} + {@link AdminPageTopBar} chrome as the uvsgames
 * catalogue so the two read identically; it is leaner only where the source is
 * (no format mapping, no watched templates, playloltcg auto-accepts on player
 * count). Filters live in the URL, shared with the uvsgames catalogue's params
 * wherever the two sources mean the same thing by them.
 *
 * @returns The catalogue tab for playloltcg.
 */
export function PlayloltcgCatalogPage() {
  const filters = Route.useSearch();
  const { page, applyFilter, goToPage } = useUrlTableFilters(filters);
  const [rulesOpen, setRulesOpen] = useState(false);
  const accept = useAcceptPlayloltcgEvent();
  const dismiss = useDismissPlayloltcgEvent();
  const undismiss = useUndismissPlayloltcgEvent();
  const fetchEvent = useFetchPlayloltcgEvent();

  async function handleFetch(activityShopId: number) {
    let result;
    try {
      result = await fetchEvent.mutateAsync({ activityShopId });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    announceSyncTrigger("Fetch", result);
  }

  const triage = urlTriage(filters.triage);
  const { sort, direction, serverSort } = urlTableSort({
    key: filters.eventSort,
    direction: filters.eventDir,
    fallback: SORT_FALLBACK,
    keys: META_CATALOG_SORTS,
    onChange: (next) => applyFilter({ eventSort: next.sort, eventDir: next.direction }),
  });

  const params: PlayloltcgCatalogParams = {
    page,
    search: filters.q,
    triage: triage.query,
    status: filters.plStatus,
    minPlayers: filters.minPlayers,
    missing: filters.missing,
    awaitingResults: filters.awaitingResults,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sort,
    direction,
  };
  const { data } = useAdminPlayloltcgCatalog(params);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PLAYLOLTCG_CATALOG_PAGE_SIZE));

  return (
    <>
      <AdminPageTopBar
        title="Meta Archive"
        actions={
          <PageTopBarButton onClick={() => setRulesOpen(true)}>
            <SlidersHorizontalIcon />
            Auto-accept rules
          </PageTopBarButton>
        }
      />
      <AdminTable
        columns={columns}
        data={data?.rows ?? []}
        getRowKey={(row) => String(row.activityShopId)}
        serverSort={serverSort}
        emptyText={data === undefined ? "Loading the catalogue…" : "No events match these filters."}
        toolbar={
          <PlayloltcgCatalogFilters
            filters={filters}
            triage={triage.selected}
            counts={data?.counts}
            total={total}
            applyFilter={applyFilter}
          />
        }
        actions={
          <PlayloltcgRowActions
            busy={
              accept.isPending || dismiss.isPending || undismiss.isPending || fetchEvent.isPending
            }
            onAccept={(activityShopId) => accept.mutate({ activityShopId })}
            onDismiss={(activityShopId) => dismiss.mutateAsync({ activityShopId })}
            onUndismiss={(activityShopId) => undismiss.mutate({ activityShopId })}
            onFetch={(activityShopId) => void handleFetch(activityShopId)}
          />
        }
      />
      <AdminPager
        page={page}
        totalPages={totalPages}
        onPageChange={goToPage}
        label="Catalogue pages"
      />

      {rulesOpen && (
        <MetaAutoAcceptDialog source="playloltcg" onClose={() => setRulesOpen(false)} />
      )}
    </>
  );
}
