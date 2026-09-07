import type { DeckCheckEntrySummaryResponse } from "@openrift/shared/types/api/deck-check";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BanIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cardLinkVariants } from "@/components/ui/card-link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/features/cards/components/search-input";
import { DeckCheckListSkeleton } from "@/features/tournaments/components/deck-check-skeletons";
import {
  useCreateTournamentDeckCheckEntry,
  useDeleteTournamentDeckCheckEntry,
  useSetTournamentDeckCheckEntryState,
  useTournamentDeckCheckEntries,
} from "@/features/tournaments/hooks/use-tournament-deck-check";
import { useTournamentParticipants } from "@/features/tournaments/hooks/use-tournaments";
import { parseManualDecklist } from "@/features/tournaments/lib/deck-check-manual-entry";
import {
  compareParticipantsForList,
  PARTICIPANT_STATUS_LABEL,
} from "@/features/tournaments/lib/tournament-display";
import { useZoneOrder } from "@/hooks/use-enums";
import { cn } from "@/lib/utils";

/** Actionable entries first: submissions to review, then drafts, then done. */
const STATE_ORDER: Record<DeckCheckEntrySummaryResponse["state"], number> = {
  submitted: 0,
  editable: 1,
  approved: 2,
  checked: 3,
  withdrawn: 4,
};

// Polls so all judges share state.
export function TournamentDeckCheckEntries({
  tournamentId,
  canManage,
}: {
  tournamentId: string;
  /** Host / organizer: may add players by hand. */
  canManage: boolean;
}) {
  const { data: detail } = useTournamentDeckCheckEntries(tournamentId);
  const [search, setSearch] = useState("");

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-full max-w-xs" />
        <DeckCheckListSkeleton count={5} />
      </div>
    );
  }

  const { event, entries } = detail;
  const needle = search.trim().toLowerCase();
  const visible = entries
    .filter((entry) => !needle || entry.playerName.toLowerCase().includes(needle))
    .toSorted(
      (a, b) =>
        Number(b.unlockRequestedAt !== null) - Number(a.unlockRequestedAt !== null) ||
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        a.playerName.localeCompare(b.playerName),
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search players"
          ariaLabel="Search players"
          className="w-full max-w-xs"
        />
        <p className="text-muted-foreground text-sm">
          {`${event.approvedCount} approved · ${event.checkedCount} checked of ${event.entryCount}`}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground">
          {entries.length === 0
            ? "No decks yet. They appear as players submit or your organizer system pushes lists."
            : "No players match the search."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((entry) => (
            <EntryRow
              key={entry.id}
              tournamentId={tournamentId}
              entry={entry}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TournamentDeckCheckAddButton({ tournamentId }: { tournamentId: string }) {
  const { data: detail } = useTournamentDeckCheckEntries(tournamentId);
  const [addOpen, setAddOpen] = useState(false);
  const takenParticipantIds = new Set(
    (detail?.entries ?? [])
      .map((entry) => entry.participantId)
      .filter((id): id is string => id !== null),
  );

  return (
    <>
      <PageTopBarPrimaryButton
        title="Attach a decklist to a participant by hand"
        onClick={() => setAddOpen(true)}
      >
        <PlusIcon />
        Add deck
      </PageTopBarPrimaryButton>
      <AddDeckDialog
        tournamentId={tournamentId}
        takenParticipantIds={takenParticipantIds}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </>
  );
}

function CheckedProgressChip({ verified, total }: { verified: number; total: number }) {
  if (total === 0) {
    return null;
  }
  const done = verified === total;
  return (
    <Badge
      variant={done ? "success" : verified > 0 ? "warning" : "muted"}
      className="tabular-nums"
      title={`${verified} of ${total} cards checked`}
    >
      {done ? <CheckIcon /> : null}
      {verified} / {total}
    </Badge>
  );
}

function EntryRow({
  tournamentId,
  entry,
  canManage,
}: {
  tournamentId: string;
  entry: DeckCheckEntrySummaryResponse;
  /** Host / organizer: gets the row's withdraw / restore / delete menu. */
  canManage: boolean;
}) {
  // The owning participant has left the event: flag the deck so a judge isn't
  // checking a list for someone who is out. The entry's own state is untouched.
  const participantInactive =
    entry.participantStatus === "dropped" || entry.participantStatus === "no_show";
  return (
    <Card className={cn(cardLinkVariants(), "flex-row items-center gap-3 p-3")}>
      <Link
        to="/tournaments/$id/decks/$entryId"
        params={{ id: tournamentId, entryId: entry.id }}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2",
          participantInactive && "opacity-60",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              "min-w-0 truncate font-medium",
              entry.state === "withdrawn" && "line-through",
            )}
          >
            {entry.playerName}
          </span>
          {entry.source === "api" ? (
            <Badge variant="outline" title="Submitted by the organizer system">
              API
            </Badge>
          ) : null}
          {entry.source === "self" ? (
            <Badge variant="outline" title="Submitted by the player through OpenRift">
              Self
            </Badge>
          ) : null}
        </span>
        {entry.state === "editable" ? null : (
          <CheckedProgressChip verified={entry.verifiedCopyCount} total={entry.copyCount} />
        )}
        {entry.unlockRequestedAt ? (
          <Badge variant="destructive" title="The player asked to unlock this approved deck">
            Unlock requested
          </Badge>
        ) : null}
        {entry.changedSinceReview ? (
          <Badge variant="destructive">Changed since review</Badge>
        ) : null}
        {entry.unmatchedLineCount > 0 ? (
          <Badge variant="secondary">{entry.unmatchedLineCount} unmatched</Badge>
        ) : null}
        {participantInactive && entry.participantStatus ? (
          <Badge
            variant="outline"
            className="text-muted-foreground"
            title="This player has left the tournament. Their deck is kept"
          >
            {PARTICIPANT_STATUS_LABEL[entry.participantStatus]}
          </Badge>
        ) : (
          <EntryStateBadge state={entry.state} reviewOutcome={entry.reviewOutcome} />
        )}
      </Link>
      {canManage ? <EntryRowMenu tournamentId={tournamentId} entry={entry} /> : null}
    </Card>
  );
}

function EntryRowMenu({
  tournamentId,
  entry,
}: {
  tournamentId: string;
  entry: DeckCheckEntrySummaryResponse;
}) {
  const setState = useSetTournamentDeckCheckEntryState();
  const deleteEntry = useDeleteTournamentDeckCheckEntry();
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleDelete() {
    try {
      await deleteEntry.mutateAsync({ tournamentId, entryId: entry.id });
      setDeleteOpen(false);
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="ghost" aria-label={`Actions for ${entry.playerName}`} />
          }
        >
          <EllipsisVerticalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {entry.state === "withdrawn" ? (
            <DropdownMenuItem
              disabled={setState.isPending}
              onClick={() =>
                setState.mutate({ tournamentId, entryId: entry.id, state: "submitted" })
              }
            >
              <RotateCcwIcon className="size-4" />
              Restore entry
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={setState.isPending}
              onClick={() =>
                setState.mutate({ tournamentId, entryId: entry.id, state: "withdrawn" })
              }
            >
              <BanIcon className="size-4" />
              Withdraw
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon className="size-4" />
            Delete entry
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this entry?"
        description="The player's list and check history are removed. This cannot be undone. Withdraw the entry instead if they only dropped out."
        confirmLabel="Delete"
        pendingLabel="Deleting..."
        isPending={deleteEntry.isPending}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}

export function EntryStateBadge({
  state,
  reviewOutcome,
}: {
  state: DeckCheckEntrySummaryResponse["state"];
  reviewOutcome: DeckCheckEntrySummaryResponse["reviewOutcome"];
}) {
  if (state === "editable") {
    return <Badge variant="outline">Editing</Badge>;
  }
  if (state === "approved") {
    return <Badge>Approved</Badge>;
  }
  if (state === "checked") {
    return reviewOutcome === "issue" ? (
      <Badge variant="destructive">Checked · issue</Badge>
    ) : (
      <Badge>Checked</Badge>
    );
  }
  if (state === "withdrawn") {
    return <Badge variant="secondary">Withdrawn</Badge>;
  }
  return reviewOutcome === "issue" ? (
    <Badge variant="destructive">Submitted · issue</Badge>
  ) : (
    <Badge variant="secondary">Submitted</Badge>
  );
}

function AddDeckDialog({
  tournamentId,
  takenParticipantIds,
  open,
  onOpenChange,
}: {
  tournamentId: string;
  takenParticipantIds: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { zoneLabels } = useZoneOrder();
  const navigate = useNavigate();
  const createEntry = useCreateTournamentDeckCheckEntry();
  const { data: participants } = useTournamentParticipants(tournamentId);
  const [participantId, setParticipantId] = useState("");
  const [decklist, setDecklist] = useState("");

  const available = participants.items
    .filter(
      (participant) =>
        (participant.status === "active" || participant.status === "invited") &&
        !takenParticipantIds.has(participant.id),
    )
    .toSorted(compareParticipantsForList);
  const rosterItems = available.map((participant) => ({
    value: participant.id,
    label: `${participant.displayName} (${PARTICIPANT_STATUS_LABEL[participant.status]})`,
  }));

  const parsed = parseManualDecklist(decklist);
  const perZone = [...Map.groupBy(parsed.cards, (card) => card.section).entries()].map(
    ([section, cards]) => ({
      section,
      copies: cards.reduce((sum, card) => sum + card.quantity, 0),
    }),
  );

  const reset = () => {
    setParticipantId("");
    setDecklist("");
  };

  const handleSubmit = async () => {
    if (!participantId) {
      return;
    }
    await createEntry.mutateAsync({
      tournamentId,
      participantId,
      cards: parsed.cards,
    });
    toast.success("Deck added");
    reset();
    onOpenChange(false);
    void navigate({
      to: "/tournaments/$id/decks",
      params: { id: tournamentId },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          reset();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogForm onSubmit={() => void handleSubmit()}>
          <DialogHeader>
            <DialogTitle>Add a deck</DialogTitle>
            <DialogDescription>Attach a decklist to someone on the roster.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Participant</Label>
              {rosterItems.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No participants without a deck. Add them on the Participants tab, then attach a
                  deck here.
                </p>
              ) : (
                <Select
                  items={rosterItems}
                  value={participantId}
                  onValueChange={(value) => value && setParticipantId(value)}
                >
                  <SelectTrigger aria-label="Participant">
                    <SelectValue placeholder="Choose a participant" />
                  </SelectTrigger>
                  <SelectContent>
                    {rosterItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-entry-decklist">Decklist</Label>
              <Textarea
                id="manual-entry-decklist"
                value={decklist}
                onChange={(event) => setDecklist(event.target.value)}
                rows={10}
                className="font-mono"
                placeholder={
                  "Champion:\n1 Some Champion\nMain:\n3 Some Card\nSideboard:\n2 Tech Card"
                }
              />
              <p className="text-muted-foreground text-sm">
                One card per line as <code>2 Card Name</code>, with optional zone headers. Matches
                are checked after you save.
              </p>
              {parsed.cards.length > 0 ? (
                <p className="text-muted-foreground text-sm">
                  {parsed.totalCopies} {parsed.totalCopies === 1 ? "copy" : "copies"} ·{" "}
                  {perZone
                    .map(
                      ({ section, copies }) =>
                        `${zoneLabels[section as never] ?? section} ${copies}`,
                    )
                    .join(" · ")}
                </p>
              ) : null}
              {parsed.warnings.map((warning) => (
                <p key={warning} className="text-destructive text-sm">
                  {warning}
                </p>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createEntry.isPending || !participantId}>
              {createEntry.isPending ? "Adding..." : "Add deck"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
