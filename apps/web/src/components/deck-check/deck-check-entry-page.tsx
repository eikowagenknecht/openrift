import { useNavigate } from "@tanstack/react-router";
import { ExpandIcon, PlusIcon, ShrinkIcon } from "lucide-react";
import { useState } from "react";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import {
  CHECK_CELL_WIDTH,
  CHECK_GRID_GAP,
  CardChecklist,
  DisplayModeToggle,
} from "@/components/deck-check/deck-check-checklist";
import { AddCardDialog, EditPlayerDialog } from "@/components/deck-check/deck-check-entry-dialogs";
import {
  DeckEntryTopBar,
  EntryHeader,
  EntryPreview,
  EntryTopBarActions,
  PlayerMessageField,
  StatsSummary,
} from "@/components/deck-check/deck-check-entry-header";
import { ChangeBanner, FindingsBanner } from "@/components/deck-check/deck-check-findings";
import { DeckCheckCardZonesSkeleton } from "@/components/deck-check/deck-check-skeletons";
import { ColumnControls } from "@/components/filters/column-controls";
import { SortGroupControls } from "@/components/filters/sort-group-controls";
import type { SortGroupOption } from "@/components/filters/sort-group-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import {
  useDeleteTournamentDeckCheckEntry,
  useSetTournamentDeckCheckEntryState,
  useTournamentDeckCheckEntry,
} from "@/hooks/use-tournament-deck-check";
import { zoneFixAllowed } from "@/lib/deck-check-actions";
import { cn } from "@/lib/utils";
import { useDeckCheckViewStore } from "@/stores/deck-check-view-store";
import type { DeckCheckSort } from "@/stores/deck-check-view-store";

/** Card-line sort options exposed in the checker toolbar. */
const CHECK_SORT_OPTIONS: SortGroupOption<DeckCheckSort>[] = [
  { value: "deck", label: "Deck order" },
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
  { value: "domain", label: "Domain" },
  { value: "energy", label: "Energy" },
];

/**
 * The checker: lifecycle controls, advisory legality findings, deck stats, and
 * the zone-grouped card list where each card is a tappable verification tick.
 * Polls so concurrent judges reconcile.
 * @returns The checker page content.
 */
export function TournamentDeckCheckEntry({
  tournamentId,
  entryId,
  canManage,
}: {
  tournamentId: string;
  entryId: string;
  /** Host / organizer: may delete entries (judges can review but not delete). */
  canManage: boolean;
}) {
  const { data: detail, refetch } = useTournamentDeckCheckEntry(tournamentId, entryId);
  const wide = useDeckCheckViewStore((state) => state.wide);
  const setWide = useDeckCheckViewStore((state) => state.setWide);
  const displayMode = useDeckCheckViewStore((state) => state.displayMode);
  const setDisplayMode = useDeckCheckViewStore((state) => state.setDisplayMode);
  const sortBy = useDeckCheckViewStore((state) => state.sortBy);
  const setSortBy = useDeckCheckViewStore((state) => state.setSortBy);
  const sortDir = useDeckCheckViewStore((state) => state.sortDir);
  const setSortDir = useDeckCheckViewStore((state) => state.setSortDir);
  const maxColumns = useDeckCheckViewStore((state) => state.maxColumns);
  const setMaxColumns = useDeckCheckViewStore((state) => state.setMaxColumns);
  const { containerRef, columns, physicalMax, physicalMin, autoColumns, containerWidth } =
    useResponsiveColumns(maxColumns);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const setState = useSetTournamentDeckCheckEntryState();
  const deleteEntry = useDeleteTournamentDeckCheckEntry();
  const navigate = useNavigate();

  // A state transition, folding in any unsaved notes so a judge's notes survive
  // when they advance the entry from the top bar or the action row.
  const transition = (
    state: "editable" | "submitted" | "approved" | "checked" | "withdrawn",
    reviewOutcome?: "ok" | "issue",
  ) => {
    setState.mutate(
      {
        tournamentId,
        entryId,
        state,
        reviewOutcome,
        ...(notesDirty ? { notes: notes.trim() || null } : {}),
      },
      { onSuccess: () => setNotesDirty(false) },
    );
  };

  if (!detail) {
    return (
      <>
        <DeckEntryTopBar tournamentId={tournamentId} />
        <div className="px-safe mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex flex-col gap-4 md:flex-row">
            <Skeleton className="aspect-[4/3] w-full shrink-0 rounded-lg md:w-72" />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
          <DeckCheckCardZonesSkeleton cellWidth={CHECK_CELL_WIDTH} />
        </div>
      </>
    );
  }

  // The rendered width of one card, derived from the resolved column count, for
  // image resolution and for sizing the small content-width flow zones.
  const cellWidth =
    columns > 0 && containerWidth > 0
      ? Math.floor((containerWidth - (columns - 1) * CHECK_GRID_GAP) / columns)
      : CHECK_CELL_WIDTH;

  // An editable list has not been delivered to an official (TR 401.3): the
  // server sends no cards, and the page shows a notice instead of the deck.
  const listHidden = detail.entry.state === "editable";

  return (
    <>
      <DeckEntryTopBar
        tournamentId={tournamentId}
        entry={detail.entry}
        actions={
          <EntryTopBarActions
            entry={detail.entry}
            transition={transition}
            pending={setState.isPending}
            canManage={canManage}
            onEdit={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        }
      />
      <div className="px-safe mx-auto flex w-full max-w-5xl flex-col gap-4">
        <EntryHeader
          tournamentId={tournamentId}
          entryId={entryId}
          detail={detail}
          transition={transition}
          pending={setState.isPending}
        />
        <div className="flex flex-col gap-4 md:flex-row">
          {listHidden ? null : <EntryPreview cards={detail.cards} />}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {listHidden ? null : <StatsSummary detail={detail} />}
            <Textarea
              value={notesDirty ? notes : (detail.entry.notes ?? "")}
              onChange={(event) => {
                setNotes(event.target.value);
                setNotesDirty(true);
              }}
              placeholder="Notes for this entry (saved with a state change, not shared with the player)"
              maxLength={4000}
              rows={3}
              className="flex-1"
            />
            <PlayerMessageField
              tournamentId={tournamentId}
              entryId={entryId}
              entry={detail.entry}
            />
          </div>
        </div>
        {detail.entry.changeSummary ? <ChangeBanner summary={detail.entry.changeSummary} /> : null}
        <FindingsBanner
          tournamentId={tournamentId}
          detail={detail}
          onResolved={() => void refetch()}
        />
        {listHidden ? (
          <p className="text-muted-foreground bg-muted/50 rounded-md border p-3 text-sm">
            Hidden from judges until the player submits, or submissions close.
          </p>
        ) : null}
      </div>
      {listHidden ? null : (
        <div
          className={cn(
            "px-safe w-full pt-4 pb-4",
            (!wide || displayMode === "list") && "mx-auto max-w-5xl",
          )}
        >
          <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
            {detail.entry.state === "submitted" ? (
              <Button variant="outline" onClick={() => setAddCardOpen(true)}>
                <PlusIcon className="size-4" />
                Add card
              </Button>
            ) : null}
            <SortGroupControls
              sortOptions={CHECK_SORT_OPTIONS}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortByChange={setSortBy}
              onSortDirChange={setSortDir}
            />
            <DisplayModeToggle mode={displayMode} onModeChange={setDisplayMode} />
            {displayMode === "grid" ? (
              <ColumnControls
                maxColumns={maxColumns}
                autoColumns={autoColumns}
                minColumns={physicalMin}
                maxColumnsLimit={physicalMax}
                onMaxColumnsChange={setMaxColumns}
              />
            ) : null}
            {displayMode === "grid" ? (
              <Button
                variant="outline"
                className="hidden md:flex"
                aria-pressed={wide}
                onClick={() => setWide(!wide)}
              >
                {wide ? <ShrinkIcon className="size-4" /> : <ExpandIcon className="size-4" />}
                {wide ? "Narrow view" : "Wide view"}
              </Button>
            ) : null}
          </div>
          <AddCardDialog
            tournamentId={tournamentId}
            entryId={entryId}
            open={addCardOpen}
            onOpenChange={setAddCardOpen}
          />
          <div ref={containerRef}>
            <CardChecklist
              tournamentId={tournamentId}
              entryId={entryId}
              cards={detail.cards}
              displayMode={displayMode}
              sortBy={sortBy}
              sortDir={sortDir}
              columns={columns}
              cellWidth={cellWidth}
              locked={detail.entry.state !== "submitted"}
              fixLocked={!zoneFixAllowed(detail.entry.state)}
              fixZoneOnly={detail.entry.state === "approved" || detail.entry.state === "checked"}
              tickLocked={detail.entry.state !== "submitted" && detail.entry.state !== "approved"}
              onStale={() => void refetch()}
            />
          </div>
        </div>
      )}
      <EditPlayerDialog
        tournamentId={tournamentId}
        entryId={entryId}
        entry={detail.entry}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {canManage ? (
        <ConfirmActionDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete this entry?"
          description="The player's list and check history are removed. This cannot be undone. Withdraw the entry instead if they only dropped out."
          confirmLabel="Delete"
          pendingLabel="Deleting..."
          isPending={deleteEntry.isPending}
          onConfirm={async () => {
            await deleteEntry.mutateAsync({ tournamentId, entryId });
            setDeleteOpen(false);
            void navigate({ to: "/tournaments/$id/decks", params: { id: tournamentId } });
          }}
        />
      ) : null}
    </>
  );
}
