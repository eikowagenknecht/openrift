import { formatDay } from "@openrift/shared";
import type { PlayloltcgCatalogRow } from "@openrift/shared/contracts/admin/meta-catalog";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminPager } from "@/components/admin/admin-pager";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { DebouncedSearchInput } from "@/components/admin/debounced-search-input";
import { TriageFilterSelect, urlTriage } from "@/components/admin/meta-triage-filter";
import { PageDescription } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PLAYLOLTCG_CATALOG_PAGE_SIZE,
  useAcceptPlayloltcgEvent,
  useAdminPlayloltcgCatalog,
  useDismissPlayloltcgEvent,
} from "@/hooks/use-admin-playloltcg-catalog";
import { useUrlTableFilters } from "@/hooks/use-url-table-filters";
import { Route } from "@/routes/_app/_authenticated/admin/meta";

/** One step of the source's sortWeight lifecycle, as a short label and a chip tone. */
interface StatusDisplay {
  label: string;
  variant: "outline" | "warning" | "success";
}

/** The sortWeight lifecycle, 1..5. The source can report a step outside it. */
const STATUS_DISPLAY: Record<number, StatusDisplay | undefined> = {
  1: { label: "Reg open", variant: "outline" },
  2: { label: "Full", variant: "outline" },
  3: { label: "Scheduled", variant: "outline" },
  4: { label: "In progress", variant: "warning" },
  5: { label: "Finished", variant: "success" },
};

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

function VenueCell({ row }: AdminCellSlotProps<PlayloltcgCatalogRow>) {
  const parts = [row?.shopName, row?.city].filter((part): part is string => Boolean(part));
  return (
    <span className="text-muted-foreground">{parts.length === 0 ? "—" : parts.join(", ")}</span>
  );
}

function PlayersCell({ row }: AdminCellSlotProps<PlayloltcgCatalogRow>) {
  return <span className="tabular-nums">{row?.playerCount ?? "—"}</span>;
}

function StatusCell({ row }: AdminCellSlotProps<PlayloltcgCatalogRow>) {
  if (!row) {
    return null;
  }
  const status = row.status === null ? undefined : STATUS_DISPLAY[row.status];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status && <Badge variant={status.variant}>{status.label}</Badge>}
      {row.battleMode !== null && row.battleMode !== "1v1" && (
        <Badge variant="subtle">{row.battleMode}</Badge>
      )}
      {row.fetchedAt !== null && <Badge variant="subtle">Fetched</Badge>}
    </div>
  );
}

/**
 * The per-row triage actions. The mutations live on the page rather than here,
 * so a fifty-row page holds two of them instead of a hundred.
 *
 * @returns The actions for one catalogue row.
 */
function PlayloltcgRowActions({
  row,
  busy,
  onAccept,
  onDismiss,
}: AdminCellSlotProps<PlayloltcgCatalogRow> & {
  busy: boolean;
  onAccept: (activityShopId: number) => void;
  onDismiss: (activityShopId: number) => void;
}) {
  if (!row) {
    return null;
  }
  if (row.triage === "accepted") {
    return <Badge variant="success">Accepted</Badge>;
  }
  if (row.triage === "dismissed") {
    return <span className="text-muted-foreground">Dismissed</span>;
  }
  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" disabled={busy} onClick={() => onAccept(row.activityShopId)}>
        Accept
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => onDismiss(row.activityShopId)}
      >
        Dismiss
      </Button>
    </div>
  );
}

const columns: AdminColumnDef<PlayloltcgCatalogRow>[] = [
  { header: "Date", width: "w-28", cell: <DateCell /> },
  { header: "Event", cell: <NameCell /> },
  { header: "Venue", cell: <VenueCell /> },
  { header: "Players", width: "w-20", align: "right", cell: <PlayersCell /> },
  { header: "Status", width: "w-40", cell: <StatusCell /> },
];

/**
 * The playloltcg catalogue triage list (ADR-014, second source). Built on the
 * same {@link AdminTable} + {@link AdminPageTopBar} chrome as the uvsgames
 * catalogue so the two read identically; it is leaner only where the source is
 * (no format mapping, no watched templates, playloltcg auto-accepts on player
 * count). Filters live in the URL, shared with the uvsgames catalogue's params,
 * and the triage param means the same thing on both.
 *
 * @returns The catalogue tab for playloltcg.
 */
export function PlayloltcgCatalogPage() {
  const filters = Route.useSearch();
  const { page, applyFilter, goToPage } = useUrlTableFilters(filters);
  const accept = useAcceptPlayloltcgEvent();
  const dismiss = useDismissPlayloltcgEvent();

  const triage = urlTriage(filters.triage);
  const { data } = useAdminPlayloltcgCatalog({ page, search: filters.q, triage: triage.query });
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PLAYLOLTCG_CATALOG_PAGE_SIZE));

  return (
    <>
      <AdminPageTopBar title="Meta Archive" />
      <AdminTable
        columns={columns}
        data={data?.rows ?? []}
        getRowKey={(row) => String(row.activityShopId)}
        emptyText={data === undefined ? "Loading the catalogue…" : "No events match these filters."}
        toolbar={
          <div className="space-y-3">
            <PageDescription>
              Every Riftbound event the Chinese app lists, as of the last sync. Accept an event to
              publish it on /meta: this creates its public event page and fetches its standings and
              any published decklists. Dismiss the ones /meta should never carry.
            </PageDescription>
            <div className="flex flex-wrap items-center gap-2">
              <DebouncedSearchInput
                urlValue={filters.q ?? ""}
                onCommit={(value) => applyFilter({ q: value === "" ? undefined : value })}
                placeholder="Search event or shop"
                className="w-64"
              />
              <TriageFilterSelect
                selected={triage.selected}
                counts={data?.counts}
                onChange={(next) => applyFilter({ triage: next })}
              />
            </div>
            <p className="text-muted-foreground">
              {total} matching {total === 1 ? "event" : "events"}.
            </p>
          </div>
        }
        actions={
          <PlayloltcgRowActions
            busy={accept.isPending || dismiss.isPending}
            onAccept={(activityShopId) => accept.mutate({ activityShopId })}
            onDismiss={(activityShopId) => dismiss.mutate({ activityShopId })}
          />
        }
      />
      <AdminPager
        page={page}
        totalPages={totalPages}
        onPageChange={goToPage}
        label="Catalogue pages"
      />
    </>
  );
}
