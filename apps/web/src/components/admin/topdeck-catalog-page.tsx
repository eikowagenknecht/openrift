import { formatDay, META_CATALOG_SORTS } from "@openrift/shared";
import type { TopdeckCatalogRow } from "@openrift/shared/contracts/admin/meta-catalog";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ArchiveXIcon, CheckIcon, LayersIcon, SlidersHorizontalIcon, UndoIcon } from "lucide-react";
import { useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminPager } from "@/components/admin/admin-pager";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { MetaAutoAcceptDialog } from "@/components/admin/meta-auto-accept-dialog";
import { MetaCoverageChips } from "@/components/admin/meta-coverage-chips";
import { ConfirmActionButton } from "@/components/admin/meta-review-shared";
import { urlTriage } from "@/components/admin/meta-triage-filter";
import { TopdeckCatalogFilters } from "@/components/admin/topdeck-catalog-filters";
import { PageTopBarButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TopdeckCatalogParams } from "@/hooks/use-admin-topdeck-catalog";
import {
  TOPDECK_CATALOG_PAGE_SIZE,
  useAcceptTopdeckEvent,
  useAdminTopdeckCatalog,
  useDismissTopdeckEvent,
  useUndismissTopdeckEvent,
} from "@/hooks/use-admin-topdeck-catalog";
import { urlTableSort, useUrlTableFilters } from "@/hooks/use-url-table-filters";
import {
  catalogTriageDisplay,
  META_SOURCE_LABELS,
  topdeckCoverageRow,
} from "@/lib/meta-catalog-display";

const routeApi = getRouteApi("/_app/_authenticated/admin/meta");

function DateCell({ row }: AdminCellSlotProps<TopdeckCatalogRow>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{formatDay(row.startAt)}</span>;
}

function NameCell({ row }: AdminCellSlotProps<TopdeckCatalogRow>) {
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

function StatusCell({ row }: AdminCellSlotProps<TopdeckCatalogRow>) {
  if (!row) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline">{row.format}</Badge>
      {row.isTeamEvent && <Badge variant="subtle">Teams</Badge>}
      {row.topCut !== null && row.topCut > 0 && <Badge variant="subtle">Top {row.topCut}</Badge>}
      {row.missingSince !== null && (
        <Badge variant="destructive" title="Gone from the listing">
          Missing
        </Badge>
      )}
    </div>
  );
}

function PlayersCell({ row }: AdminCellSlotProps<TopdeckCatalogRow>) {
  return <span className="tabular-nums">{row?.playerCount ?? "—"}</span>;
}

function VenueCell({ row }: AdminCellSlotProps<TopdeckCatalogRow>) {
  const parts = [row?.city, row?.country].filter((part): part is string => Boolean(part));
  return (
    <span className="text-muted-foreground block max-w-56 truncate">
      {parts.length === 0 ? "—" : parts.join(", ")}
    </span>
  );
}

function CoverageCell({ row }: AdminCellSlotProps<TopdeckCatalogRow>) {
  if (!row) {
    return null;
  }
  const triage = catalogTriageDisplay(row.triage);
  const rival = row.rivalProvider;
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant={triage.variant}>{triage.label}</Badge>
      {rival !== null && (
        <Badge
          variant="muted"
          title="The linked event reads another source. This one is cited for attribution and not promoted, so its players are not archived twice."
        >
          Cited only, {META_SOURCE_LABELS[rival as keyof typeof META_SOURCE_LABELS] ?? rival} wins
        </Badge>
      )}
      <MetaCoverageChips row={topdeckCoverageRow(row)} />
    </div>
  );
}

const columns: AdminColumnDef<TopdeckCatalogRow>[] = [
  { header: "Date", width: "w-28", sortKey: "startAt", sortFirst: "desc", cell: <DateCell /> },
  { header: "Event", sortKey: "name", cell: <NameCell /> },
  { header: "Format", cell: <StatusCell /> },
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

interface TopdeckRowHandlers {
  busy: boolean;
  onAccept: (tid: string) => void;
  onDismiss: (tid: string) => Promise<unknown>;
  onUndismiss: (tid: string) => void;
}

/** No "Fetch now" button: a catalogued row already has its standings. */
function TopdeckRowActions({
  row,
  busy,
  onAccept,
  onDismiss,
  onUndismiss,
}: AdminCellSlotProps<TopdeckCatalogRow> & TopdeckRowHandlers) {
  if (!row) {
    return null;
  }

  if (row.triage === "dismissed") {
    return (
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => onUndismiss(row.tid)}>
        <UndoIcon />
        Undismiss
      </Button>
    );
  }

  if (row.triage === "accepted") {
    return (
      row.metaEventId !== null && (
        <Button
          variant="ghost"
          size="sm"
          render={<Link to="/admin/meta/$eventId" params={{ eventId: row.metaEventId }} />}
        >
          <LayersIcon />
          Standings
        </Button>
      )
    );
  }

  return (
    <>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAccept(row.tid)}>
        <CheckIcon />
        Accept
      </Button>
      <ConfirmActionButton
        title={`Dismiss "${row.name}"?`}
        description="The event drops out of the new queue and the sync skips it from now on. You can undismiss it later."
        confirmLabel="Dismiss"
        onConfirm={() => onDismiss(row.tid)}
      >
        <ArchiveXIcon />
        Dismiss
      </ConfirmActionButton>
    </>
  );
}

/** The topdeck catalogue triage list, on the same chrome as the other two so all three read identically. */
export function TopdeckCatalogPage() {
  const filters = routeApi.useSearch();
  const { page, applyFilter, goToPage } = useUrlTableFilters(filters);
  const [rulesOpen, setRulesOpen] = useState(false);
  const accept = useAcceptTopdeckEvent();
  const dismiss = useDismissTopdeckEvent();
  const undismiss = useUndismissTopdeckEvent();

  const triage = urlTriage(filters.triage);
  const { sort, direction, serverSort } = urlTableSort({
    key: filters.eventSort,
    direction: filters.eventDir,
    fallback: SORT_FALLBACK,
    keys: META_CATALOG_SORTS,
    onChange: (next) => applyFilter({ eventSort: next.sort, eventDir: next.direction }),
  });

  const params: TopdeckCatalogParams = {
    page,
    search: filters.q,
    triage: triage.query,
    format: filters.tdFormat,
    minPlayers: filters.minPlayers,
    missing: filters.missing,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sort,
    direction,
  };
  const { data } = useAdminTopdeckCatalog(params);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / TOPDECK_CATALOG_PAGE_SIZE));

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
        getRowKey={(row) => row.tid}
        serverSort={serverSort}
        emptyText={data === undefined ? "Loading the catalogue…" : "No events match these filters."}
        toolbar={
          <TopdeckCatalogFilters
            filters={filters}
            triage={triage.selected}
            counts={data?.counts}
            total={total}
            applyFilter={applyFilter}
          />
        }
        actions={
          <TopdeckRowActions
            busy={accept.isPending || dismiss.isPending || undismiss.isPending}
            onAccept={(tid) => accept.mutate({ tid })}
            onDismiss={(tid) => dismiss.mutateAsync({ tid })}
            onUndismiss={(tid) => undismiss.mutate({ tid })}
          />
        }
      />
      <AdminPager
        page={page}
        totalPages={totalPages}
        onPageChange={goToPage}
        label="Catalogue pages"
      />

      {rulesOpen && <MetaAutoAcceptDialog source="topdeck" onClose={() => setRulesOpen(false)} />}
    </>
  );
}
