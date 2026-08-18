import type { AdminMetaDeck, MetaCandidateDeck, MetaCandidateSource } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, Link2OffIcon, ListPlusIcon } from "lucide-react";

import { CandidateStateBadge } from "@/components/admin/meta-candidate-shared";
import { MetaCardNamePicker } from "@/components/admin/meta-card-name-picker";
import { MetaDeckListDiff } from "@/components/admin/meta-deck-list-diff";
import { MetaDeckSuggestions } from "@/components/admin/meta-deck-suggestions";
import { MetaPublicLinkButton } from "@/components/admin/meta-public-link";
import { MetaSubmissionResolve } from "@/components/admin/meta-submission-resolve";
import { Heading } from "@/components/heading";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { adminMetaEventDecksQueryOptions } from "@/hooks/use-admin-meta";
import {
  useAcceptMetaCandidateDeck,
  useAcceptMetaDeckField,
  useAcceptMetaDeckList,
  useLinkMetaCandidateDeck,
  useUnlinkMetaCandidateDeck,
} from "@/hooks/use-admin-meta-candidates";
import { useMetaSubmissionForCandidateDeck } from "@/hooks/use-admin-meta-submissions";
import { useZoneOrder } from "@/hooks/use-enums";
import type { RosterColumn, RosterRow } from "@/lib/meta-deck-roster";
import {
  buildRosterColumns,
  buildRosterRows,
  candidateCardCount,
  compareRosterFields,
  rosterAcceptBlockedReason,
  rosterListDelta,
} from "@/lib/meta-deck-roster";
import { formatFinishTier } from "@/lib/meta-format";
import { cn } from "@/lib/utils";
import { useMetaRosterRowExpanded, useMetaRosterStore } from "@/stores/meta-roster-store";

/**
 * The archived deck's own cell: what the event page says about this pilot today.
 *
 * @returns The archive cell.
 */
function LiveDeckCell({ deck }: { deck: AdminMetaDeck | null }) {
  if (deck === null) {
    return <span className="text-muted-foreground text-sm">Not archived</span>;
  }
  return (
    <div className="space-y-0.5">
      <p className="tabular-nums">
        {formatFinishTier(deck.finishTier)}
        {deck.record !== null && ` · ${deck.record}`}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground text-sm tabular-nums">{deck.cardCount} cards</span>
        <MetaListStatusBadge listStatus={deck.listStatus} />
        {deck.shareToken !== null && (
          <MetaPublicLinkButton
            href={`/meta/decks/${deck.shareToken}`}
            label="Live"
            ariaLabel={`Open ${deck.playerName}'s archived deck`}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One source's cell: what it holds for this pilot, or nothing at all.
 *
 * @returns The source cell.
 */
function CandidateDeckCell({ deck }: { deck: MetaCandidateDeck | undefined }) {
  if (deck === undefined) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  return (
    <div className="space-y-0.5">
      <p className="tabular-nums">
        {formatFinishTier(deck.finishTier)}
        {deck.record !== null && ` · ${deck.record}`}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground text-sm tabular-nums">
          {candidateCardCount(deck)} cards
        </span>
        <MetaListStatusBadge listStatus={deck.listStatus} />
        {deck.deckId === null && <Badge variant="warning">Unlinked</Badge>}
        {deck.unresolvedNames.length > 0 && (
          <Badge variant="destructive">{deck.unresolvedNames.length} unmatched</Badge>
        )}
      </div>
    </div>
  );
}

/**
 * The resolve control for a deck someone contributed, or nothing at all for a
 * scraped one.
 *
 * Whether there is a submission behind this deck is the endpoint's answer, not
 * the candidate's: `submittedByUserId` goes null if the contributor deletes
 * their account, and a submission that outlives its submitter is exactly the
 * one that must not be left pending forever.
 *
 * @returns The resolve control, or null when this deck is a provider's.
 */
function SubmissionSection({ candidateDeckId }: { candidateDeckId: string }) {
  const { data } = useMetaSubmissionForCandidateDeck(candidateDeckId);
  const submission = data?.submission ?? null;
  if (submission === null) {
    return null;
  }
  return (
    <div className="mt-2 border-t pt-2">
      <MetaSubmissionResolve submission={submission} candidateDeckId={candidateDeckId} />
    </div>
  );
}

interface SourceDetailProps {
  column: RosterColumn;
  deck: MetaCandidateDeck;
  /** The archived deck this pilot's row is about, if there is one yet. */
  live: AdminMetaDeck | null;
  zoneLabel: (zone: string) => string;
}

/**
 * One source's block inside an expanded roster row: its scalar fields against
 * the archived deck with a per-field take, the card-list diff with a
 * whole-list take, and the link actions when it is not attached yet.
 *
 * @returns The source's detail block.
 */
function RosterSourceDetail({ column, deck, live, zoneLabel }: SourceDetailProps) {
  const acceptDeck = useAcceptMetaCandidateDeck();
  const acceptField = useAcceptMetaDeckField();
  const acceptList = useAcceptMetaDeckList();
  const linkDeck = useLinkMetaCandidateDeck();
  const unlinkDeck = useUnlinkMetaCandidateDeck();

  const linked = deck.deckId !== null;
  const blockedReason = rosterAcceptBlockedReason(deck);
  const comparisons = compareRosterFields(live, deck);
  const delta = rosterListDelta(deck);

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Heading level={3}>{column.label}</Heading>
        <CandidateStateBadge state={deck.state} />
        <span className="text-muted-foreground text-sm">{deck.playerName}</span>
        {deck.submittedByName !== null && (
          <Badge variant="muted">Submitted by {deck.submittedByName}</Badge>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!linked && live !== null && (
            <Button
              variant="outline"
              size="sm"
              disabled={linkDeck.isPending}
              onClick={() => linkDeck.mutate({ id: deck.id, deckId: live.deckId })}
            >
              <ArrowLeftIcon />
              Link to this deck
            </Button>
          )}
          {!linked && (
            <Button
              variant="outline"
              size="sm"
              disabled={blockedReason !== null || acceptDeck.isPending}
              onClick={() => acceptDeck.mutate({ id: deck.id })}
            >
              Accept as new deck
            </Button>
          )}
          {linked && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={blockedReason !== null || acceptList.isPending}
                onClick={() => acceptList.mutate({ id: deck.id })}
              >
                <ListPlusIcon />
                Take this list
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={unlinkDeck.isPending}
                onClick={() => unlinkDeck.mutate({ id: deck.id })}
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

      {deck.unresolvedNames.length > 0 && (
        <div className="mt-2 space-y-1">
          {deck.unresolvedNames.map((name) => (
            <div key={name} className="flex items-center gap-2">
              <span className="text-destructive">{name}</span>
              <MetaCardNamePicker name={name} />
            </div>
          ))}
        </div>
      )}

      {deck.submissionNote !== null && (
        <p className="text-muted-foreground mt-1 text-sm">“{deck.submissionNote}”</p>
      )}

      <SubmissionSection candidateDeckId={deck.id} />

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
                  onClick={() => acceptField.mutate({ id: deck.id, field: comparison.field })}
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
            Link this source to an archived deck to take its values field by field.
          </p>
          <MetaDeckSuggestions candidateDeckId={deck.id} playerName={deck.playerName} />
        </div>
      )}

      <div className="mt-2 space-y-1">
        <p className="text-muted-foreground text-sm">
          {linked ? "Taking this list would:" : "Accepting archives this list:"}
        </p>
        <MetaDeckListDiff delta={delta} zoneLabel={zoneLabel} />
      </div>
    </div>
  );
}

interface RosterRowViewProps {
  row: RosterRow;
  columns: RosterColumn[];
  zoneLabel: (zone: string) => string;
}

/**
 * One pilot's roster row plus, when it is open, a block per source.
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
          <LiveDeckCell deck={row.live} />
        </td>
        {columns.map((column) => (
          <td key={column.id} className="border-l px-3 py-2 align-top">
            <CandidateDeckCell deck={row.cells.get(column.id)} />
          </td>
        ))}
      </tr>
      {expanded && (
        <tr className="border-b">
          <td colSpan={columns.length + 2} className="bg-muted/30 space-y-2 px-3 py-2">
            {columns.map((column) => {
              const deck = row.cells.get(column.id);
              if (deck === undefined) {
                return null;
              }
              return (
                <RosterSourceDetail
                  key={column.id}
                  column={column}
                  deck={deck}
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

interface MetaDeckRosterProps {
  /** The live event every column feeds. The roster only exists once one is linked. */
  metaEventId: string;
  /** Every candidate linked to it, one column each. */
  sources: MetaCandidateSource[];
  /** Decks submitted against the live event directly; they belong to no source. */
  submittedDecks: MetaCandidateDeck[];
}

/**
 * The deck roster (ADR-014's review screen, tier two): one row per pilot, one
 * column per source, each cell holding what that source says about that pilot
 * beside the archived deck. Expanding a row shows the card-list diff and the
 * per-field takes.
 *
 * @returns The roster table.
 */
export function MetaDeckRoster({ metaEventId, sources, submittedDecks }: MetaDeckRosterProps) {
  const { zoneLabels } = useZoneOrder();
  const { data, isPending } = useQuery(adminMetaEventDecksQueryOptions(metaEventId));
  const collapseAll = useMetaRosterStore((state) => state.collapseAll);

  // A candidate's zone slugs come from the source, so one may name no
  // configured zone; that is a boundary value, not a missing enum label.
  function zoneLabel(zone: string): string {
    return zoneLabels[zone as keyof typeof zoneLabels] ?? zone;
  }

  const liveDecks = data?.decks ?? [];
  const columns = buildRosterColumns(sources, submittedDecks.length);
  const rows = buildRosterRows(liveDecks, sources, submittedDecks);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Heading level={2}>Deck roster</Heading>
        <span className="text-muted-foreground text-sm">
          {rows.length} {rows.length === 1 ? "pilot" : "pilots"}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => collapseAll()}>
          Collapse all
        </Button>
      </div>

      {isPending && <p className="text-muted-foreground text-sm">Loading archived decks…</p>}
      {!isPending && rows.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No source carries a deck for this event yet.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="px-3 py-2 text-left font-medium">Pilot</th>
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
