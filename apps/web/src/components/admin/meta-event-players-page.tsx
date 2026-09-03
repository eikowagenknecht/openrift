import type { AdminMetaPlayer } from "@openrift/shared";
import type { MetaPlayerOverlayField } from "@openrift/shared/types";
import { ExternalLinkIcon, LockIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { MetaEventUploadsPanel } from "@/components/admin/meta-event-uploads-panel";
import { MetaPlayerDialog } from "@/components/admin/meta-player-dialog";
import { MetaPublicLinkButton } from "@/components/admin/meta-public-link";
import {
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarPrimaryButton,
} from "@/components/layout/page-top-bar";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import {
  useAdminMetaEvent,
  useAdminMetaEventPlayers,
  useDeleteMetaPlayer,
} from "@/hooks/use-admin-meta";
import { useReleasePlayerOverlayField } from "@/hooks/use-admin-meta-overlays";
import {
  formatRank,
  formatRankRuns,
  formatRecord,
  metaPlayerClaimChips,
  recordSortValue,
  standingsGaps,
} from "@/lib/meta-format";

function PlayerCell({ row }: AdminCellSlotProps<AdminMetaPlayer>) {
  if (!row) {
    return null;
  }
  return <span className="font-medium">{row.playerName}</span>;
}

function FinishCell({ row }: AdminCellSlotProps<AdminMetaPlayer>) {
  if (!row) {
    return null;
  }
  return <span className="tabular-nums">{formatRank(row.rank, row.rankIsTier)}</span>;
}

function RecordCell({ row }: AdminCellSlotProps<AdminMetaPlayer>) {
  if (!row) {
    return null;
  }
  return (
    <span className="text-muted-foreground tabular-nums">
      {formatRecord(row.wins, row.losses, row.draws) ?? "—"}
    </span>
  );
}

function LegendCell({ row }: AdminCellSlotProps<AdminMetaPlayer>) {
  if (!row) {
    return null;
  }
  // The pair the public archive prints, so both surfaces name a deck alike.
  const pair = [row.legendName, row.championName].filter(Boolean).join(" / ");
  return <span className="text-muted-foreground">{pair === "" ? "—" : pair}</span>;
}

function DeckCell({ row }: AdminCellSlotProps<AdminMetaPlayer>) {
  if (!row) {
    return null;
  }
  if (row.listStatus === "none") {
    return <span className="text-muted-foreground text-sm">Standings only</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      {row.deckName}
      <span className="text-muted-foreground text-sm tabular-nums">{row.cardCount} cards</span>
      <MetaListStatusBadge listStatus={row.listStatus} />
    </span>
  );
}

/**
 * The fields accepted overlays own for this row, each with the release that
 * hands it back. Mirrors the drift panel's un-claim: no confirmation, because
 * re-editing the row claims it again.
 *
 * @returns The claim chips, or nothing for a row the sources still decide.
 */
function ClaimedFields({ player }: { player: AdminMetaPlayer }) {
  const release = useReleasePlayerOverlayField();
  const chips = metaPlayerClaimChips(player.claimedFields);

  async function handleRelease(field: MetaPlayerOverlayField): Promise<void> {
    try {
      await release.mutateAsync({ id: player.id, field });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success("Released. The sources decide this again.");
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <Badge key={chip.field} variant="outline">
          <LockIcon className="size-3" />
          {chip.label}
          <ChipRemoveButton
            aria-label={`Hand ${chip.label} back to the sources`}
            disabled={release.isPending}
            onClick={() => {
              void handleRelease(chip.field);
            }}
          />
        </Badge>
      ))}
    </span>
  );
}

function ClaimedFieldsCell({ row }: AdminCellSlotProps<AdminMetaPlayer>) {
  if (!row) {
    return null;
  }
  return <ClaimedFields player={row} />;
}

const columns: AdminColumnDef<AdminMetaPlayer>[] = [
  { header: "Finish", width: "w-20", sortValue: (player) => player.rank, cell: <FinishCell /> },
  { header: "Player", sortValue: (player) => player.playerName, cell: <PlayerCell /> },
  {
    header: "Record",
    sortFirst: "desc",
    sortValue: (player) => recordSortValue(player.wins, player.losses),
    cell: <RecordCell />,
  },
  { header: "Legend", sortValue: (player) => player.legendName, cell: <LegendCell /> },
  { header: "Deck", sortValue: (player) => player.deckName, cell: <DeckCell /> },
  {
    header: "Claimed",
    sortValue: (player) => player.claimedFields.length,
    cell: <ClaimedFieldsCell />,
  },
];

function PlayerRowActions({
  row,
  onEdit,
}: AdminCellSlotProps<AdminMetaPlayer> & { onEdit: (player: AdminMetaPlayer) => void }) {
  if (!row) {
    return null;
  }
  return (
    <>
      {row.shareToken !== null && (
        <MetaPublicLinkButton
          href={`/meta/decks/${row.shareToken}`}
          label="View"
          ariaLabel={`Open ${row.playerName}'s archived deck`}
        />
      )}
      <Button variant="ghost" onClick={() => onEdit(row)}>
        Edit
      </Button>
    </>
  );
}

/**
 * How much of the field the archive holds, and which ranks it is missing. A
 * single absent rank is invisible in a hundred-row table, so the holes are
 * named here rather than left to be scrolled for.
 *
 * @returns The coverage line above the standings table.
 */
function StandingsCoverage({
  players,
  reported,
}: {
  players: readonly AdminMetaPlayer[];
  reported: number | null;
}) {
  const gaps = standingsGaps(players, reported);
  const held = players.length;
  const counts = reported !== null && reported !== held ? `${held} of ${reported}` : `${held}`;
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2">
      <span className="tabular-nums">{counts} standings archived</span>
      {gaps.length > 0 && <Badge variant="warning">Missing {formatRankRuns(gaps)}</Badge>}
    </div>
  );
}

/** What the dialog is doing: nothing, adding, or editing one standings row. */
type DialogState = { mode: "create" } | { mode: "edit"; player: AdminMetaPlayer } | null;

/**
 * Standings management for one archived event (ADR-014): every player the archive
 * holds, best finish first, decks and deckless entries alike, plus the form that
 * adds another.
 *
 * @returns The event's standings management page.
 */
export function MetaEventPlayersPage({ eventId }: { eventId: string }) {
  const { data: event } = useAdminMetaEvent(eventId);
  const { data } = useAdminMetaEventPlayers(eventId);
  const deletePlayer = useDeleteMetaPlayer();
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <>
      <AdminPageTopBar
        title={event.name}
        back={
          <PageTopBarBack
            to="/admin/meta"
            search={{ tab: "public" }}
            aria-label="Back to all events"
          />
        }
        actions={
          <>
            <PageTopBarButton
              render={
                <a
                  href={`/meta/${event.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${event.name} in the public archive`}
                />
              }
            >
              Public page
              <ExternalLinkIcon />
            </PageTopBarButton>
            <PageTopBarPrimaryButton onClick={() => setDialog({ mode: "create" })}>
              Add Player
            </PageTopBarPrimaryButton>
          </>
        }
      />

      <AdminTable
        columns={columns}
        data={data.players}
        getRowKey={(player) => player.id}
        defaultSort={{ column: "Finish", direction: "asc" }}
        emptyText="No standings archived for this event yet."
        toolbar={<StandingsCoverage players={data.players} reported={event.playerCount} />}
        actions={<PlayerRowActions onEdit={(player) => setDialog({ mode: "edit", player })} />}
        delete={{
          onDelete: (player) => deletePlayer.mutateAsync({ id: player.id, eventId }),
          confirm: (player) => ({
            title: `Delete ${player.playerName}?`,
            description:
              player.listStatus === "none"
                ? `${player.playerName}'s standings row is removed from the archive. This cannot be undone.`
                : `${player.playerName}'s standings row, their archived deck, and its permalink are removed from the archive. This cannot be undone.`,
          }),
        }}
      />

      <MetaEventUploadsPanel eventId={eventId} />

      {dialog && (
        <MetaPlayerDialog
          eventId={eventId}
          eventFormat={event.format}
          player={dialog.mode === "edit" ? dialog.player : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
