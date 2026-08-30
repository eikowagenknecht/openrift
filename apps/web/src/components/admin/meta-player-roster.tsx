import type { AdminMetaPlayer, MetaCandidatePlayer, MetaCandidateSource } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, Link2OffIcon, ListPlusIcon } from "lucide-react";

import { CandidateStateBadge } from "@/components/admin/meta-candidate-shared";
import { MetaCardNamePicker } from "@/components/admin/meta-card-name-picker";
import { MetaDeckListDiff } from "@/components/admin/meta-deck-list-diff";
import { MetaPlayerSuggestions } from "@/components/admin/meta-player-suggestions";
import { MetaPublicLinkButton } from "@/components/admin/meta-public-link";
import { MetaSubmissionResolve } from "@/components/admin/meta-submission-resolve";
import { Heading } from "@/components/heading";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { adminMetaEventPlayersQueryOptions } from "@/hooks/use-admin-meta";
import {
  useAcceptMetaCandidatePlayer,
  useAcceptMetaDeckList,
  useAcceptMetaPlayerField,
  useLinkMetaCandidatePlayer,
  useUnlinkMetaCandidatePlayer,
} from "@/hooks/use-admin-meta-candidates";
import { useMetaSubmissionForCandidatePlayer } from "@/hooks/use-admin-meta-submissions";
import { useZoneOrder } from "@/hooks/use-enums";
import { formatRank } from "@/lib/meta-format";
import type { RosterColumn, RosterRow } from "@/lib/meta-player-roster";
import {
  buildRosterColumns,
  buildRosterRows,
  candidateCardCount,
  compareRosterFields,
  needsUnresolvedLegendConfirm,
  rosterAcceptBlockedReason,
  rosterListDelta,
  rosterRecord,
} from "@/lib/meta-player-roster";
import { cn } from "@/lib/utils";
import { useMetaRosterRowExpanded, useMetaRosterStore } from "@/stores/meta-roster-store";

/**
 * The archived standings row's own cell: what the event page says about this
 * player today.
 *
 * @returns The archive cell.
 */
function LivePlayerCell({ player }: { player: AdminMetaPlayer | null }) {
  if (player === null) {
    return <span className="text-muted-foreground text-sm">Not archived</span>;
  }
  const record = rosterRecord(player);
  return (
    <div className="space-y-0.5">
      <p className="tabular-nums">
        {formatRank(player.rank, player.rankIsTier)}
        {record !== null && ` · ${record}`}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {player.legendName !== null && (
          <span className="text-muted-foreground text-sm">{player.legendName}</span>
        )}
        {player.listStatus === "none" ? (
          <span className="text-muted-foreground text-sm">No list</span>
        ) : (
          <span className="text-muted-foreground text-sm tabular-nums">
            {player.cardCount} cards
          </span>
        )}
        <MetaListStatusBadge listStatus={player.listStatus} />
        {player.shareToken !== null && (
          <MetaPublicLinkButton
            href={`/meta/decks/${player.shareToken}`}
            label="Live"
            ariaLabel={`Open ${player.playerName}'s archived deck`}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One source's cell: what it holds for this player, or nothing at all.
 *
 * @returns The source cell.
 */
function CandidatePlayerCell({ player }: { player: MetaCandidatePlayer | undefined }) {
  if (player === undefined) {
    return <span className="text-muted-foreground text-sm">(not listed)</span>;
  }
  const record = rosterRecord(player);
  return (
    <div className="space-y-0.5">
      <p className="tabular-nums">
        {formatRank(player.rank, player.rankIsTier)}
        {record !== null && ` · ${record}`}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {player.legendName !== null && (
          <span
            className={cn("text-sm", player.legendCardId === null && "text-destructive")}
            title={player.legendCardId === null ? "This legend name matched no card" : undefined}
          >
            {player.legendName}
          </span>
        )}
        {player.cards !== null && (
          <span className="text-muted-foreground text-sm tabular-nums">
            {candidateCardCount(player)} cards
          </span>
        )}
        <MetaListStatusBadge listStatus={player.listStatus} />
        {player.metaEventPlayerId === null && <Badge variant="warning">Unlinked</Badge>}
        {player.unresolvedNames.length > 0 && (
          <Badge variant="destructive">{player.unresolvedNames.length} unmatched</Badge>
        )}
      </div>
    </div>
  );
}

/**
 * The resolve control for a list someone contributed, or nothing at all for a
 * scraped row.
 *
 * Whether there is a submission behind this row is the endpoint's answer, not
 * the candidate's: `submittedByUserId` goes null if the contributor deletes
 * their account, and a submission that outlives its submitter is exactly the
 * one that must not be left pending forever.
 *
 * @returns The resolve control, or null when this row is a provider's.
 */
function SubmissionSection({ candidatePlayerId }: { candidatePlayerId: string }) {
  const { data } = useMetaSubmissionForCandidatePlayer(candidatePlayerId);
  const submission = data?.submission ?? null;
  if (submission === null) {
    return null;
  }
  return (
    <div className="mt-2 border-t pt-2">
      <MetaSubmissionResolve submission={submission} candidatePlayerId={candidatePlayerId} />
    </div>
  );
}

interface SourceDetailProps {
  column: RosterColumn;
  player: MetaCandidatePlayer;
  /** The archived standings row this player's row is about, if there is one yet. */
  live: AdminMetaPlayer | null;
  zoneLabel: (zone: string) => string;
}

/**
 * One source's block inside an expanded roster row: its scalar fields against
 * the archived row with a per-field take, the card-list diff with a whole-list
 * take, and the link actions when it is not attached yet.
 *
 * @returns The source's detail block.
 */
function RosterSourceDetail({ column, player, live, zoneLabel }: SourceDetailProps) {
  const acceptPlayer = useAcceptMetaCandidatePlayer();
  const acceptField = useAcceptMetaPlayerField();
  const acceptList = useAcceptMetaDeckList();
  const linkPlayer = useLinkMetaCandidatePlayer();
  const unlinkPlayer = useUnlinkMetaCandidatePlayer();

  const linked = player.metaEventPlayerId !== null;
  const blockedReason = rosterAcceptBlockedReason(player);
  const allowUnresolvedLegend = needsUnresolvedLegendConfirm(player);
  const comparisons = compareRosterFields(live, player);
  const delta = rosterListDelta(player);
  const hasList = player.cards !== null;

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Heading level={3}>{column.label}</Heading>
        <CandidateStateBadge state={player.state} />
        <span className="text-muted-foreground text-sm">{player.playerName}</span>
        {player.submittedByName !== null && (
          <Badge variant="muted">Submitted by {player.submittedByName}</Badge>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!linked && live !== null && (
            <Button
              variant="outline"
              size="sm"
              disabled={linkPlayer.isPending}
              onClick={() => linkPlayer.mutate({ id: player.id, metaEventPlayerId: live.id })}
            >
              <ArrowLeftIcon />
              Link to this player
            </Button>
          )}
          {!linked && (
            <Button
              variant="outline"
              size="sm"
              disabled={blockedReason !== null || acceptPlayer.isPending}
              onClick={() => acceptPlayer.mutate({ id: player.id, allowUnresolvedLegend })}
            >
              {hasList ? "Accept with this list" : "Accept as new player"}
            </Button>
          )}
          {linked && (
            <>
              {hasList && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={blockedReason !== null || acceptList.isPending}
                  onClick={() => acceptList.mutate({ id: player.id })}
                >
                  <ListPlusIcon />
                  Take this list
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={unlinkPlayer.isPending}
                onClick={() => unlinkPlayer.mutate({ id: player.id })}
              >
                <Link2OffIcon />
                Unlink
              </Button>
            </>
          )}
        </div>
      </div>

      {blockedReason !== null && (
        <p className="text-muted-foreground mt-1 text-sm">{blockedReason}</p>
      )}

      {allowUnresolvedLegend && (
        <p className="text-muted-foreground mt-1 text-sm">
          Accepting files this player with no legend, which leaves them out of the play-rate stats.
          Match the name below first to avoid that.
        </p>
      )}

      {player.unresolvedNames.length > 0 && (
        <div className="mt-2 space-y-1">
          {player.unresolvedNames.map((name) => (
            <div key={name} className="flex items-center gap-2">
              <span className="text-destructive">{name}</span>
              <MetaCardNamePicker name={name} />
            </div>
          ))}
        </div>
      )}

      {player.submissionNote !== null && (
        <p className="text-muted-foreground mt-1 text-sm">“{player.submissionNote}”</p>
      )}

      <SubmissionSection candidatePlayerId={player.id} />

      {linked && (
        <ul className="mt-2 space-y-1">
          {comparisons.map((comparison) => (
            <li key={comparison.field} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground w-24 shrink-0">{comparison.label}</span>
              <span className="tabular-nums">{comparison.live}</span>
              <span className="text-muted-foreground">→</span>
              <span className={cn("tabular-nums", comparison.differs && "font-medium")}>
                {comparison.candidate}
              </span>
              {comparison.differs && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={acceptField.isPending}
                  onClick={() => acceptField.mutate({ id: player.id, field: comparison.field })}
                >
                  Take
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!linked && (
        <div className="mt-2 space-y-1">
          <p className="text-muted-foreground text-sm">
            Link this source to an archived player to take its values field by field.
          </p>
          <MetaPlayerSuggestions candidatePlayerId={player.id} playerName={player.playerName} />
        </div>
      )}

      {hasList && (
        <div className="mt-2 space-y-1">
          <p className="text-muted-foreground text-sm">
            {linked ? "Taking this list would:" : "Accepting archives this list:"}
          </p>
          <MetaDeckListDiff delta={delta} zoneLabel={zoneLabel} />
        </div>
      )}
    </div>
  );
}

interface RosterRowViewProps {
  row: RosterRow;
  columns: RosterColumn[];
  zoneLabel: (zone: string) => string;
}

/**
 * One player's roster row plus, when it is open, a block per source.
 *
 * The expansion is read from the store rather than from a prop: the roster maps
 * over its rows, and a `.map()` callback closing over changing parent state
 * cannot be cached by the React Compiler, so every row would re-render whenever
 * any row opened.
 *
 * @returns The row, and its detail row when expanded.
 */
function MetaRosterRowView({ row, columns, zoneLabel }: RosterRowViewProps) {
  const expanded = useMetaRosterRowExpanded(row.key);
  const toggleRow = useMetaRosterStore((state) => state.toggleRow);

  return (
    <>
      <tr className="border-b">
        <td className="px-3 py-2 align-top">
          <ExpandToggle
            expanded={expanded}
            aria-label={`${row.playerName}: show what each source holds`}
            onClick={() => toggleRow(row.key)}
          >
            <span className="font-medium">{row.playerName}</span>
          </ExpandToggle>
        </td>
        <td className="border-l px-3 py-2 align-top">
          <LivePlayerCell player={row.live} />
        </td>
        {columns.map((column) => (
          <td key={column.id} className="border-l px-3 py-2 align-top">
            <CandidatePlayerCell player={row.cells.get(column.id)} />
          </td>
        ))}
      </tr>
      {expanded && (
        <tr className="border-b">
          <td colSpan={columns.length + 2} className="bg-muted/30 space-y-2 px-3 py-2">
            {columns.map((column) => {
              const player = row.cells.get(column.id);
              if (player === undefined) {
                return null;
              }
              return (
                <RosterSourceDetail
                  key={column.id}
                  column={column}
                  player={player}
                  live={row.live}
                  zoneLabel={zoneLabel}
                />
              );
            })}
          </td>
        </tr>
      )}
    </>
  );
}

interface MetaPlayerRosterProps {
  /** The live event every column feeds. The roster only exists once one is linked. */
  metaEventId: string;
  /** Every candidate linked to it, one column each. */
  sources: MetaCandidateSource[];
  /** Rows submitted against the live event directly; they belong to no source. */
  submittedPlayers: MetaCandidatePlayer[];
}

/**
 * The standings roster (ADR-014's review screen, tier two): one row per player,
 * one column per source, each cell holding what that source says about that
 * player beside the archived row. Expanding a row shows the card-list diff and
 * the per-field takes.
 *
 * @returns The roster table.
 */
export function MetaPlayerRoster({
  metaEventId,
  sources,
  submittedPlayers,
}: MetaPlayerRosterProps) {
  const { zoneLabels } = useZoneOrder();
  const { data, isPending } = useQuery(adminMetaEventPlayersQueryOptions(metaEventId));
  const collapseAll = useMetaRosterStore((state) => state.collapseAll);

  // A candidate's zone slugs come from the source, so one may name no
  // configured zone; that is a boundary value, not a missing enum label.
  function zoneLabel(zone: string): string {
    return zoneLabels[zone as keyof typeof zoneLabels] ?? zone;
  }

  const livePlayers = data?.players ?? [];
  const columns = buildRosterColumns(sources, submittedPlayers.length);
  const rows = buildRosterRows(livePlayers, sources, submittedPlayers);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Heading level={2}>Standings roster</Heading>
        <span className="text-muted-foreground text-sm">
          {rows.length} {rows.length === 1 ? "player" : "players"}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => collapseAll()}>
          Collapse all
        </Button>
      </div>

      {isPending && <p className="text-muted-foreground text-sm">Loading archived standings…</p>}
      {!isPending && rows.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No source carries a standings row for this event yet.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="px-3 py-2 text-left font-medium">Player</th>
                <th className="border-l px-3 py-2 text-left font-medium">Archive</th>
                {columns.map((column) => (
                  <th key={column.id} className="border-l px-3 py-2 text-left font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <MetaRosterRowView
                  key={row.key}
                  row={row}
                  columns={columns}
                  zoneLabel={zoneLabel}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
