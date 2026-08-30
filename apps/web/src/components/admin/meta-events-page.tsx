import type { AdminMetaEvent } from "@openrift/shared";
import { formatDay, META_EVENT_SORTS } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { LayersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminPager } from "@/components/admin/admin-pager";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { MetaEventDialog } from "@/components/admin/meta-event-dialog";
import { EventFilters } from "@/components/admin/meta-events-filters";
import { MetaPublicLinkButton } from "@/components/admin/meta-public-link";
import { PageTopBarButton, PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ADMIN_META_EVENT_PAGE_SIZE,
  META_EVENT_SORT_FALLBACK,
  metaEventsParamsFromSearch,
  useAdminMetaEvents,
  useDeleteMetaEvent,
  useReclassifyMetaEvents,
} from "@/hooks/use-admin-meta";
import { useDeckFormatList } from "@/hooks/use-enums";
import { urlTableSort, useUrlTableFilters } from "@/hooks/use-url-table-filters";
import { candidateProviderDisplay } from "@/lib/meta-candidate-review";
import { Route } from "@/routes/_app/_authenticated/admin/meta";

function NameCell({ row }: AdminCellSlotProps<AdminMetaEvent>) {
  if (!row) {
    return null;
  }
  return <span className="font-medium">{row.name}</span>;
}

function DateCell({ row }: AdminCellSlotProps<AdminMetaEvent>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{formatDay(row.eventDate)}</span>;
}

function FormatCell({
  row,
  labels,
}: AdminCellSlotProps<AdminMetaEvent> & { labels: Record<string, string> }) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground">{labels[row.format] ?? row.format}</span>;
}

function OrganizerCell({ row }: AdminCellSlotProps<AdminMetaEvent>) {
  if (!row) {
    return null;
  }
  return (
    <span className="text-muted-foreground block max-w-48 truncate">{row.organizer ?? "—"}</span>
  );
}

function StandingsCell({ row }: AdminCellSlotProps<AdminMetaEvent>) {
  if (!row) {
    return null;
  }
  return (
    <span className="tabular-nums">
      {row.playerRowCount}
      {row.playerCount !== null && (
        <span className="text-muted-foreground"> / {row.playerCount}</span>
      )}
    </span>
  );
}

function DeckCountCell({ row }: AdminCellSlotProps<AdminMetaEvent>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{row.deckCount}</span>;
}

function SourcesCell({ row }: AdminCellSlotProps<AdminMetaEvent>) {
  if (!row) {
    return null;
  }
  if (row.sources.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {row.sources.map((source) => {
        const provider = candidateProviderDisplay(source.provider);
        return (
          <Badge
            key={source.candidateEventId}
            variant={provider.variant}
            render={
              <Link
                to="/admin/meta/candidates/$candidateId"
                params={{ candidateId: source.candidateEventId }}
              />
            }
          >
            {provider.label}
          </Badge>
        );
      })}
    </div>
  );
}

/**
 * Built per render for the reason `catalogColumns` states.
 *
 * @param formatLabels - Deck-format slug to display label.
 * @returns The live archive's columns.
 */
function eventColumns(formatLabels: Record<string, string>): AdminColumnDef<AdminMetaEvent>[] {
  return [
    {
      header: "Date",
      width: "w-28",
      sortKey: "eventDate",
      sortFirst: "desc",
      cell: <DateCell />,
    },
    { header: "Name", sortKey: "name", cell: <NameCell /> },
    { header: "Format", sortKey: "format", cell: <FormatCell labels={formatLabels} /> },
    // What the archive holds over the field size the source reported, then the
    // lists among those rows: most events have far more standings than published
    // decks, and both gaps are what the maintainer works down.
    {
      header: "Standings",
      align: "right",
      sortKey: "playerRowCount",
      sortFirst: "desc",
      cell: <StandingsCell />,
    },
    {
      header: "Decks",
      align: "right",
      sortKey: "deckCount",
      sortFirst: "desc",
      cell: <DeckCountCell />,
    },
    { header: "Organizer", sortKey: "organizer", cell: <OrganizerCell /> },
    // The way back from a live row to where its numbers came from. Not sortable:
    // the count lives in the candidate table, not on the event row the endpoint
    // orders.
    { header: "Sources", cell: <SourcesCell /> },
  ];
}

function EventRowActions({
  row,
  onEdit,
}: AdminCellSlotProps<AdminMetaEvent> & { onEdit: (event: AdminMetaEvent) => void }) {
  if (!row) {
    return null;
  }
  return (
    <>
      <MetaPublicLinkButton
        href={`/meta/${row.slug}`}
        label="View"
        ariaLabel={`Open ${row.name} in the public archive`}
      />
      <Button
        variant="ghost"
        render={<Link to="/admin/meta/$eventId" params={{ eventId: row.id }} />}
      >
        <LayersIcon />
        Standings
      </Button>
      <Button variant="ghost" onClick={() => onEdit(row)}>
        Edit
      </Button>
    </>
  );
}

/** What the dialog is doing: nothing, creating, or editing one event. */
type DialogState = { mode: "create" } | { mode: "edit"; event: AdminMetaEvent } | null;

/**
 * The Meta Archive's event list (ADR-014). Events are created and edited in a
 * dialog rather than inline, because notes alone is a 4 000-character markdown
 * field; the row's Standings action leads to that event's player management.
 *
 * @returns The admin event list page.
 */
export function MetaEventsPage() {
  const filters = Route.useSearch();
  const { page, applyFilter, goToPage } = useUrlTableFilters(filters);
  const { formats, labels: formatLabels } = useDeckFormatList();
  const deleteEvent = useDeleteMetaEvent();
  const [dialog, setDialog] = useState<DialogState>(null);

  const { serverSort } = urlTableSort({
    key: filters.liveSort,
    direction: filters.liveDir,
    fallback: META_EVENT_SORT_FALLBACK,
    keys: META_EVENT_SORTS,
    onChange: (next) => applyFilter({ liveSort: next.sort, liveDir: next.direction }),
  });

  const { data } = useAdminMetaEvents(metaEventsParamsFromSearch(filters));

  const reclassifyEvents = useReclassifyMetaEvents();

  async function handleReclassify() {
    let summary;
    try {
      summary = await reclassifyEvents.mutateAsync();
    } catch {
      /* Reported by the global mutation error toast. */
      return;
    }
    const kept = summary.keptManual > 0 ? `, kept ${summary.keptManual} hand-set values` : "";
    toast.success(
      `Reclassified ${summary.candidates} candidates and ${summary.liveEvents} live events${kept}.`,
    );
  }

  const total = data.total;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_META_EVENT_PAGE_SIZE));
  const columns = eventColumns(formatLabels);

  return (
    <>
      <AdminPageTopBar
        title="Meta Archive"
        actions={
          <>
            <PageTopBarButton
              onClick={() => void handleReclassify()}
              disabled={reclassifyEvents.isPending}
            >
              {reclassifyEvents.isPending ? "Reapplying…" : "Reapply tier rules"}
            </PageTopBarButton>
            <PageTopBarPrimaryButton onClick={() => setDialog({ mode: "create" })}>
              Add Event
            </PageTopBarPrimaryButton>
          </>
        }
      />

      <AdminTable
        columns={columns}
        data={data.events}
        getRowKey={(event) => event.id}
        serverSort={serverSort}
        emptyText="No events match these filters."
        toolbar={
          <EventFilters
            filters={filters}
            formats={formats}
            total={total}
            applyFilter={applyFilter}
          />
        }
        actions={<EventRowActions onEdit={(event) => setDialog({ mode: "edit", event })} />}
        delete={{
          onDelete: (event) => deleteEvent.mutateAsync(event.id),
          confirm: (event) => ({
            title: `Delete "${event.name}"?`,
            description:
              event.playerRowCount > 0
                ? `This also deletes the ${event.playerRowCount} archived ${event.playerRowCount === 1 ? "player" : "players"} and the ${event.deckCount} ${event.deckCount === 1 ? "deck" : "decks"} under them, permalinks included. This cannot be undone.`
                : "This cannot be undone.",
          }),
        }}
      />

      <AdminPager
        page={page}
        totalPages={totalPages}
        onPageChange={goToPage}
        label="Archive pages"
      />

      {dialog && (
        <MetaEventDialog
          event={dialog.mode === "edit" ? dialog.event : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
