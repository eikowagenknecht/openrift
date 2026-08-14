import type { AdminMetaEvent } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { LayersIcon } from "lucide-react";
import { useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { MetaEventDialog } from "@/components/admin/meta-event-dialog";
import { PageDescription, PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { useAdminMetaEvents, useDeleteMetaEvent } from "@/hooks/use-admin-meta";
import { useDeckFormatList } from "@/hooks/use-enums";
import { formatAbsoluteDate } from "@/lib/format-date";

function SlugCell({ row }: AdminCellSlotProps<AdminMetaEvent>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

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
  return (
    <span className="tabular-nums">
      {formatAbsoluteDate(row.eventDate, { year: "numeric", month: "short", day: "numeric" })}
    </span>
  );
}

function FormatCell({ row }: AdminCellSlotProps<AdminMetaEvent>) {
  const { labels } = useDeckFormatList();
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground">{labels[row.format] ?? row.format}</span>;
}

function PlayerCountCell({ row }: AdminCellSlotProps<AdminMetaEvent>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{row.playerCount ?? "—"}</span>;
}

function OrganizerCell({ row }: AdminCellSlotProps<AdminMetaEvent>) {
  if (!row) {
    return null;
  }
  return (
    <span className="text-muted-foreground block max-w-48 truncate">{row.organizer ?? "—"}</span>
  );
}

function DeckCountCell({ row }: AdminCellSlotProps<AdminMetaEvent>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{row.deckCount}</span>;
}

const columns: AdminColumnDef<AdminMetaEvent>[] = [
  { header: "Slug", sortValue: (event) => event.slug, cell: <SlugCell /> },
  { header: "Name", sortValue: (event) => event.name, cell: <NameCell /> },
  { header: "Date", sortValue: (event) => event.eventDate, cell: <DateCell /> },
  { header: "Format", sortValue: (event) => event.format, cell: <FormatCell /> },
  {
    header: "Players",
    align: "right",
    sortValue: (event) => event.playerCount,
    cell: <PlayerCountCell />,
  },
  { header: "Organizer", sortValue: (event) => event.organizer, cell: <OrganizerCell /> },
  {
    header: "Decks",
    align: "right",
    sortValue: (event) => event.deckCount,
    cell: <DeckCountCell />,
  },
];

function EventRowActions({
  row,
  onEdit,
}: AdminCellSlotProps<AdminMetaEvent> & { onEdit: (event: AdminMetaEvent) => void }) {
  if (!row) {
    return null;
  }
  return (
    <>
      <Button
        variant="ghost"
        render={<Link to="/admin/meta/$eventId" params={{ eventId: row.id }} />}
      >
        <LayersIcon />
        Decks
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
 * field; the row's Decks action leads to that event's deck management.
 *
 * @returns The admin event list page.
 */
export function MetaEventsPage() {
  const { data } = useAdminMetaEvents();
  const deleteEvent = useDeleteMetaEvent();
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <>
      <AdminPageTopBar
        title="Meta Archive"
        actions={
          <PageTopBarPrimaryButton onClick={() => setDialog({ mode: "create" })}>
            Add Event
          </PageTopBarPrimaryButton>
        }
      />

      <AdminTable
        columns={columns}
        data={data.events}
        getRowKey={(event) => event.id}
        defaultSort={{ column: "Date", direction: "desc" }}
        emptyText="No events archived yet."
        toolbar={
          <PageDescription>
            Curated tournament results. Each event holds the decklists entered for it; both are
            shown publicly on the Meta pages.
          </PageDescription>
        }
        actions={<EventRowActions onEdit={(event) => setDialog({ mode: "edit", event })} />}
        delete={{
          onDelete: (event) => deleteEvent.mutateAsync(event.id),
          confirm: (event) => ({
            title: `Delete "${event.name}"?`,
            description:
              event.deckCount > 0
                ? `This also deletes the ${event.deckCount} archived ${event.deckCount === 1 ? "deck" : "decks"} and their permalinks. This cannot be undone.`
                : "This cannot be undone.",
          }),
        }}
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
