import { formatDay, formatDayTime, META_CATALOG_SORTS } from "@openrift/shared";
import type { MetaCatalogRow } from "@openrift/shared/contracts/admin/meta-catalog";
import { Link } from "@tanstack/react-router";
import {
  ArchiveXIcon,
  CheckIcon,
  DownloadIcon,
  LayersIcon,
  SlidersHorizontalIcon,
  TagsIcon,
  UndoIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminPager } from "@/components/admin/admin-pager";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { MetaAutoAcceptDialog } from "@/components/admin/meta-auto-accept-dialog";
import { CatalogFilters } from "@/components/admin/meta-catalog-filters";
import {
  MetaCatalogAcceptDialog,
  announceSyncTrigger,
} from "@/components/admin/meta-catalog-shared";
import { MetaCoverageChips } from "@/components/admin/meta-coverage-chips";
import { ConfirmActionButton } from "@/components/admin/meta-review-shared";
import { MetaSourceVocabularyDialog } from "@/components/admin/meta-source-vocabulary-dialog";
import { urlTriage } from "@/components/admin/meta-triage-filter";
import { PageTopBarButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MetaCatalogQueryParams } from "@/hooks/use-admin-meta-catalog";
import {
  META_CATALOG_PAGE_SIZE,
  useAcceptCatalogEvent,
  useAdminMetaCatalog,
  useDismissCatalogEvent,
  useFetchCatalogEvent,
  useRunMetaSync,
  useUndismissCatalogEvent,
} from "@/hooks/use-admin-meta-catalog";
import { useDeckFormatList } from "@/hooks/use-enums";
import { urlTableSort, useUrlTableFilters } from "@/hooks/use-url-table-filters";
import {
  catalogDayBoundary,
  catalogStatusDisplay,
  catalogTriageDisplay,
  catalogVenueText,
} from "@/lib/meta-catalog-display";
import { Route } from "@/routes/_app/_authenticated/admin/meta";

function DateCell({ row }: AdminCellSlotProps<MetaCatalogRow>) {
  if (!row) {
    return null;
  }
  return (
    <span className="tabular-nums" title={formatDayTime(row.startAt)}>
      {formatDay(row.startAt)}
    </span>
  );
}

function NameCell({ row }: AdminCellSlotProps<MetaCatalogRow>) {
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

function StatusCell({ row }: AdminCellSlotProps<MetaCatalogRow>) {
  if (!row) {
    return null;
  }
  const status = catalogStatusDisplay(row.displayStatus);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.officialLabel !== null && (
        <Badge title="Runs on a recognized official Organized Play template">
          {row.officialLabel}
        </Badge>
      )}
      <Badge variant={status.variant}>{status.label}</Badge>
      {row.decklistStatus === "PUBLISHED" && <Badge variant="subtle">Decklists</Badge>}
      {row.missingSince !== null && (
        <Badge
          variant="destructive"
          title={`Gone from the listing since ${formatDayTime(row.missingSince)}`}
        >
          Missing
        </Badge>
      )}
    </div>
  );
}

function PlayersCell({ row }: AdminCellSlotProps<MetaCatalogRow>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{row.playerCount ?? "—"}</span>;
}

function VenueCell({ row }: AdminCellSlotProps<MetaCatalogRow>) {
  if (!row) {
    return null;
  }
  return (
    <span className="text-muted-foreground block max-w-56 truncate">{catalogVenueText(row)}</span>
  );
}

function FormatCell({
  row,
  labels,
}: AdminCellSlotProps<MetaCatalogRow> & { labels: Record<string, string> }) {
  if (!row) {
    return null;
  }
  if (row.mappedFormat !== null) {
    return <span className="text-muted-foreground">{labels[row.mappedFormat]}</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{row.eventFormat ?? "—"}</span>
      <Badge variant="warning">Unmapped</Badge>
    </span>
  );
}

function CoverageCell({ row }: AdminCellSlotProps<MetaCatalogRow>) {
  if (!row) {
    return null;
  }
  const triage = catalogTriageDisplay(row.triage);
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant={triage.variant}>{triage.label}</Badge>
      <MetaCoverageChips row={row} />
    </div>
  );
}

function catalogColumns(formatLabels: Record<string, string>): AdminColumnDef<MetaCatalogRow>[] {
  return [
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
    { header: "Format", cell: <FormatCell labels={formatLabels} /> },
    { header: "Coverage", width: "w-64", cell: <CoverageCell /> },
  ];
}

const SORT_FALLBACK = { sort: "startAt", direction: "desc" } as const;

interface AcceptFollowUp {
  follow: (row: MetaCatalogRow, slug: string) => Promise<void>;
  isPending: boolean;
}

/** No cron drains the recheck queue in this deployment, so a completed event's fetch runs here instead. */
function useAcceptFollowUp(): AcceptFollowUp {
  const fetchEvent = useFetchCatalogEvent();
  const runSync = useRunMetaSync();

  async function follow(row: MetaCatalogRow, slug: string) {
    if (row.displayStatus !== "complete") {
      toast.success(`Accepted "${row.name}"`, {
        description: `Archived as ${slug}. Its results are fetched once the event has run.`,
      });
      return;
    }

    if (row.decklistStatus === "PUBLISHED") {
      toast.success(`Accepted "${row.name}"`, {
        description: `Archived as ${slug}. Its standings and decklists are being fetched in the background.`,
      });
      try {
        await runSync.mutateAsync({ trigger: "runRecheck" });
      } catch {
        // Reported by the global mutation error toast.
      }
      return;
    }

    toast.success(`Accepted "${row.name}"`, {
      description: `Archived as ${slug}. Fetching its standings now…`,
    });
    let result;
    try {
      result = await fetchEvent.mutateAsync({ externalId: row.externalId });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    // Already queued by the accept; not an error.
    if (result.status === "already_running") {
      return;
    }
    announceSyncTrigger("Fetch", result);
  }

  return { follow, isPending: fetchEvent.isPending || runSync.isPending };
}

// The React Compiler bails on a function declared after a return, so the row-null guard sits in a wrapper below instead.
function CatalogRowActionsFor({
  row,
  onPickFormat,
}: {
  row: MetaCatalogRow;
  onPickFormat: (row: MetaCatalogRow) => void;
}) {
  const accept = useAcceptCatalogEvent();
  const dismiss = useDismissCatalogEvent();
  const undismiss = useUndismissCatalogEvent();
  const fetchEvent = useFetchCatalogEvent();
  const followUp = useAcceptFollowUp();

  async function handleAccept() {
    if (row.mappedFormat === null) {
      onPickFormat(row);
      return;
    }
    let accepted: { slug: string };
    try {
      accepted = await accept.mutateAsync({ externalId: row.externalId });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    await followUp.follow(row, accepted.slug);
  }

  async function handleFetch() {
    let result;
    try {
      result = await fetchEvent.mutateAsync({ externalId: row.externalId });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    announceSyncTrigger("Fetch", result);
  }

  if (row.triage === "dismissed") {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={undismiss.isPending}
        onClick={() => undismiss.mutate({ externalId: row.externalId })}
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
          disabled={fetchEvent.isPending}
          onClick={() => void handleFetch()}
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
        disabled={accept.isPending || followUp.isPending}
        onClick={() => void handleAccept()}
      >
        <CheckIcon />
        Accept
      </Button>
      <ConfirmActionButton
        title={`Dismiss "${row.name}"?`}
        description="The event drops out of the new queue and the sync skips it from now on. You can undismiss it later."
        confirmLabel="Dismiss"
        onConfirm={() => dismiss.mutateAsync({ externalId: row.externalId })}
      >
        <ArchiveXIcon />
        Dismiss
      </ConfirmActionButton>
    </>
  );
}

function CatalogRowActions({
  row,
  onPickFormat,
}: AdminCellSlotProps<MetaCatalogRow> & { onPickFormat: (row: MetaCatalogRow) => void }) {
  if (!row) {
    return null;
  }
  return <CatalogRowActionsFor row={row} onPickFormat={onPickFormat} />;
}

export function MetaCatalogPage() {
  const filters = Route.useSearch();
  const { page, applyFilter, goToPage } = useUrlTableFilters(filters);
  const [formatTarget, setFormatTarget] = useState<MetaCatalogRow | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [vocabularyOpen, setVocabularyOpen] = useState(false);

  const accept = useAcceptCatalogEvent();
  const followUp = useAcceptFollowUp();
  const { labels: formatLabels } = useDeckFormatList();
  const columns = catalogColumns(formatLabels);

  const triage = urlTriage(filters.triage);
  const { sort, direction, serverSort } = urlTableSort({
    key: filters.eventSort,
    direction: filters.eventDir,
    fallback: SORT_FALLBACK,
    keys: META_CATALOG_SORTS,
    onChange: (next) => applyFilter({ eventSort: next.sort, eventDir: next.direction }),
  });

  const params: MetaCatalogQueryParams = {
    page,
    search: filters.q,
    triage: triage.query,
    displayStatus: filters.eventStatus,
    minPlayers: filters.minPlayers,
    decklistPublished: filters.decklists,
    missing: filters.missing,
    awaitingResults: filters.awaitingResults,
    dateFrom: catalogDayBoundary(filters.dateFrom ?? "", "start"),
    dateTo: catalogDayBoundary(filters.dateTo ?? "", "end"),
    sort,
    direction,
  };
  const { data } = useAdminMetaCatalog(params);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / META_CATALOG_PAGE_SIZE));

  async function confirmFormat(format: string) {
    const row = formatTarget;
    if (row === null) {
      return;
    }
    let accepted: { slug: string };
    try {
      accepted = await accept.mutateAsync({ externalId: row.externalId, format });
    } catch {
      // Reported by the global mutation error toast; the dialog stays open.
      return;
    }
    setFormatTarget(null);
    await followUp.follow(row, accepted.slug);
  }

  return (
    <>
      <AdminPageTopBar
        title="Meta Archive"
        actions={
          <>
            <PageTopBarButton onClick={() => setVocabularyOpen(true)}>
              <TagsIcon />
              Templates &amp; formats
            </PageTopBarButton>
            <PageTopBarButton onClick={() => setRulesOpen(true)}>
              <SlidersHorizontalIcon />
              Auto-accept rules
            </PageTopBarButton>
          </>
        }
      />

      <AdminTable
        columns={columns}
        data={data?.rows ?? []}
        getRowKey={(row) => row.externalId}
        serverSort={serverSort}
        emptyText={data === undefined ? "Loading the catalogue…" : "No events match these filters."}
        toolbar={
          <CatalogFilters
            filters={filters}
            triage={triage.selected}
            counts={data?.counts}
            total={total}
            applyFilter={applyFilter}
          />
        }
        actions={<CatalogRowActions onPickFormat={setFormatTarget} />}
      />

      <AdminPager
        page={page}
        totalPages={totalPages}
        onPageChange={goToPage}
        label="Catalogue pages"
      />

      <MetaCatalogAcceptDialog
        row={formatTarget}
        pending={accept.isPending}
        onCancel={() => setFormatTarget(null)}
        onConfirm={(format) => void confirmFormat(format)}
      />

      {rulesOpen && <MetaAutoAcceptDialog source="uvsgames" onClose={() => setRulesOpen(false)} />}
      {vocabularyOpen && <MetaSourceVocabularyDialog onClose={() => setVocabularyOpen(false)} />}
    </>
  );
}
