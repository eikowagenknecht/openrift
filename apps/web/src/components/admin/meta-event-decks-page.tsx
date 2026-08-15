import type { AdminMetaDeck, AdminMetaEvent } from "@openrift/shared";
import { formatDay } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { MetaDeckDialog } from "@/components/admin/meta-deck-dialog";
import { MetaPublicLinkButton } from "@/components/admin/meta-public-link";
import { PageDescription, PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { Button } from "@/components/ui/button";
import {
  useAdminMetaEventDecks,
  useAdminMetaEvents,
  useDeleteMetaDeck,
} from "@/hooks/use-admin-meta";
import { useDeckFormatList } from "@/hooks/use-enums";
import { formatFinishTier } from "@/lib/meta-format";

function NameCell({ row }: AdminCellSlotProps<AdminMetaDeck>) {
  if (!row) {
    return null;
  }
  return <span className="font-medium">{row.name}</span>;
}

function PlayerCell({ row }: AdminCellSlotProps<AdminMetaDeck>) {
  if (!row) {
    return null;
  }
  return <span>{row.playerName}</span>;
}

function FinishCell({ row }: AdminCellSlotProps<AdminMetaDeck>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{formatFinishTier(row.finishTier)}</span>;
}

function RecordCell({ row }: AdminCellSlotProps<AdminMetaDeck>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground tabular-nums">{row.record ?? "—"}</span>;
}

function CardCountCell({ row }: AdminCellSlotProps<AdminMetaDeck>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{row.cardCount}</span>;
}

function ListStatusCell({ row }: AdminCellSlotProps<AdminMetaDeck>) {
  if (!row) {
    return null;
  }
  return <MetaListStatusBadge listStatus={row.listStatus} />;
}

function ShareTokenCell({ row }: AdminCellSlotProps<AdminMetaDeck>) {
  if (!row) {
    return null;
  }
  // An archetype-only deck has no public page, so there is no link to offer.
  if (row.shareToken === null) {
    return null;
  }
  return (
    <MetaPublicLinkButton
      href={`/meta/decks/${row.shareToken}`}
      label={row.shareToken}
      ariaLabel={`Open ${row.name} on the public archive`}
      mono
    />
  );
}

const columns: AdminColumnDef<AdminMetaDeck>[] = [
  { header: "Deck", sortValue: (deck) => deck.name, cell: <NameCell /> },
  { header: "Player", sortValue: (deck) => deck.playerName, cell: <PlayerCell /> },
  { header: "Finish", sortValue: (deck) => deck.finishTier, cell: <FinishCell /> },
  { header: "Record", sortValue: (deck) => deck.record, cell: <RecordCell /> },
  { header: "Cards", align: "right", sortValue: (deck) => deck.cardCount, cell: <CardCountCell /> },
  { header: "List", sortValue: (deck) => deck.listStatus, cell: <ListStatusCell /> },
  { header: "Public link", cell: <ShareTokenCell /> },
];

function DeckRowActions({
  row,
  onEdit,
}: AdminCellSlotProps<AdminMetaDeck> & { onEdit: (deck: AdminMetaDeck) => void }) {
  if (!row) {
    return null;
  }
  return (
    <Button variant="ghost" onClick={() => onEdit(row)}>
      Edit
    </Button>
  );
}

/** What the dialog is doing: nothing, adding, or editing one deck. */
type DialogState = { mode: "create" } | { mode: "edit"; deck: AdminMetaDeck } | null;

/**
 * Deck management for one archived event (ADR-014): the decks entered so far,
 * best finish first, plus the paste-a-decklist form that adds another.
 *
 * @returns The event's deck management page.
 */
export function MetaEventDecksPage({ eventId }: { eventId: string }) {
  const { data: eventsData } = useAdminMetaEvents();
  const { data } = useAdminMetaEventDecks(eventId);
  const { labels: formatLabels } = useDeckFormatList();
  const deleteDeck = useDeleteMetaDeck();
  const [dialog, setDialog] = useState<DialogState>(null);

  const event: AdminMetaEvent | undefined = eventsData.events.find((row) => row.id === eventId);
  const title = event ? event.name : "Event";

  return (
    <>
      <AdminPageTopBar
        title={title}
        actions={
          <PageTopBarPrimaryButton onClick={() => setDialog({ mode: "create" })}>
            Add Deck
          </PageTopBarPrimaryButton>
        }
      />

      <AdminTable
        columns={columns}
        data={data.decks}
        getRowKey={(deck) => deck.deckId}
        defaultSort={{ column: "Finish", direction: "asc" }}
        emptyText="No decks archived for this event yet."
        toolbar={
          <div className="space-y-2">
            <Button variant="ghost" size="sm" render={<Link to="/admin/meta" />}>
              <ArrowLeftIcon />
              All events
            </Button>
            {event && (
              <PageDescription>
                {formatDay(event.eventDate)}
                {" · "}
                {formatLabels[event.format] ?? event.format}
                {event.organizer ? ` · ${event.organizer}` : ""}
                {" · slug "}
                <span className="font-mono">{event.slug}</span>
              </PageDescription>
            )}
          </div>
        }
        actions={<DeckRowActions onEdit={(deck) => setDialog({ mode: "edit", deck })} />}
        delete={{
          onDelete: (deck) => deleteDeck.mutateAsync({ id: deck.deckId, eventId }),
          confirm: (deck) => ({
            title: `Delete "${deck.name}"?`,
            description: `${deck.playerName}'s deck and its permalink are removed from the archive. This cannot be undone.`,
          }),
        }}
      />

      {dialog && (
        <MetaDeckDialog
          eventId={eventId}
          eventFormat={event?.format ?? ""}
          deck={dialog.mode === "edit" ? dialog.deck : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
