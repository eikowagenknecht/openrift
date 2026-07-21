import type { TournamentDetailResponse, TournamentParticipantStatus } from "@openrift/shared";
import { CheckIcon, GlobeIcon, UserPlusIcon, UserXIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SearchInput } from "@/components/filters/search-input";
import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { MissingRegionsBand } from "@/components/tournaments/missing-regions-band";
import type {
  ParticipantAction,
  ParticipantTarget,
} from "@/components/tournaments/participant-row";
import { ParticipantRow, participantMissesRegion } from "@/components/tournaments/participant-row";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StatStripItem } from "@/components/ui/stat-strip";
import { StatStrip } from "@/components/ui/stat-strip";
import { useCustomTagList } from "@/hooks/use-enums";
import { useTournamentDeckCheckEntries } from "@/hooks/use-tournament-deck-check";
import {
  useAddParticipant,
  useParticipantAction,
  useTournamentParticipants,
  useUpdateParticipant,
} from "@/hooks/use-tournaments";
import { canCheckDecks, canManageTournament } from "@/lib/tournament-display";

// The roster's groups, in reading order: the things waiting on the viewer first
// (join requests, then pending invites), the field itself, and the players who
// are out of it sunk to the bottom. This is the priority the flat list used to
// imply via `compareParticipantsForList`; the groups make the split visible, and
// sort by name inside each one.
const ROSTER_GROUPS: {
  key: string;
  heading: string;
  statuses: TournamentParticipantStatus[];
  /** The group carries an identity chip — it is an approval queue, not a list. */
  icon?: typeof UserPlusIcon;
  /** Out of the field: dimmed, matching the standings table's dropped rows. */
  dimmed?: boolean;
}[] = [
  { key: "requested", heading: "Join requests", statuses: ["requested"], icon: UserPlusIcon },
  { key: "invited", heading: "Invited", statuses: ["invited"] },
  { key: "active", heading: "Active", statuses: ["active"] },
  { key: "inactive", heading: "Dropped", statuses: ["dropped", "no_show"], dimmed: true },
];

export function TournamentParticipantsTab({
  id,
  detail,
}: {
  id: string;
  detail: TournamentDetailResponse;
}) {
  const manage = canManageTournament(detail.myRoles);
  // Judges assign regions (part of deck check) even without manage rights.
  const canAssignRegion = detail.regionsEnabled && canCheckDecks(detail.myRoles);
  const { data } = useTournamentParticipants(id);
  const participants = data.items;
  const updateParticipant = useUpdateParticipant();
  const participantAction = useParticipantAction();

  // The deck-check endpoint is staff-only and 404s when deck submission is
  // off, so only fetch when the viewer can manage AND the tournament collects
  // decks. Maps each participant to their deck entry so the row can link to it.
  const { data: deckCheck } = useTournamentDeckCheckEntries(
    id,
    manage && detail.deckSubmission !== "none",
  );
  const entryByParticipant = new Map(
    (deckCheck?.entries ?? [])
      .filter((entry) => entry.participantId !== null)
      .map((entry) => [entry.participantId as string, entry]),
  );

  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<ParticipantTarget | null>(null);
  const [regionTarget, setRegionTarget] = useState<(ParticipantTarget & { region: string }) | null>(
    null,
  );
  const [fixedTableTarget, setFixedTableTarget] = useState<
    (ParticipantTarget & { fixedTable: string }) | null
  >(null);
  const [removeTarget, setRemoveTarget] = useState<ParticipantTarget | null>(null);

  const missingRegionPlayers = participants.filter((participant) =>
    participantMissesRegion(participant, detail.regionsEnabled),
  );
  const activeCount = participants.filter((participant) => participant.status === "active").length;
  const droppedCount = participants.filter(
    (participant) => participant.status === "dropped" || participant.status === "no_show",
  ).length;
  const withRegionCount = activeCount - missingRegionPlayers.length;

  const stats: StatStripItem[] = [
    { key: "active", value: activeCount, label: "active", icon: CheckIcon, iconTone: "green" },
    { key: "dropped", value: droppedCount, label: "dropped", icon: UserXIcon },
    ...(detail.regionsEnabled
      ? [
          {
            key: "regions",
            value: `${withRegionCount}/${activeCount}`,
            label: "with region",
            icon: GlobeIcon,
            iconTone: "sky" as const,
            // A full field is the verdict this page exists to deliver: pairing
            // is unblocked. A partial count is just a number.
            tone: (missingRegionPlayers.length === 0 && activeCount > 0
              ? "good"
              : "default") as StatStripItem["tone"],
          },
        ]
      : []),
  ];

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? participants.filter((participant) =>
        [participant.displayName, participant.userName].some((field) =>
          field?.toLowerCase().includes(needle),
        ),
      )
    : participants;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  function fireAction(participantId: string, action: ParticipantAction) {
    void run(() => participantAction.mutateAsync({ id, participantId, action }));
  }

  const groups = ROSTER_GROUPS.map((group) => ({
    ...group,
    players: visible
      .filter((participant) => group.statuses.includes(participant.status))
      .toSorted((a, b) => a.displayName.localeCompare(b.displayName)),
  })).filter((group) => group.players.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {canAssignRegion && missingRegionPlayers.length > 0 ? (
        <MissingRegionsBand players={missingRegionPlayers} onSetRegion={setRegionTarget} />
      ) : null}

      {participants.length > 0 ? (
        <>
          <StatStrip items={stats} />
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search players"
            ariaLabel="Search players"
            className="w-full max-w-xs"
          />
        </>
      ) : null}

      {participants.length === 0 ? (
        <p className="text-muted-foreground">No participants yet.</p>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground">No players match the search.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <SectionHeading count={group.players.length} icon={group.icon} tone="gold">
              {group.heading}
            </SectionHeading>
            <ul className="flex flex-col gap-2">
              {group.players.map((participant) => (
                <li key={participant.id}>
                  <ParticipantRow
                    participant={participant}
                    tournamentId={id}
                    regionsEnabled={detail.regionsEnabled}
                    manage={manage}
                    canAssignRegion={canAssignRegion}
                    dimmed={group.dimmed}
                    deckEntryId={entryByParticipant.get(participant.id)?.id}
                    actionPending={participantAction.isPending}
                    onAction={fireAction}
                    onRename={setRenameTarget}
                    onSetRegion={setRegionTarget}
                    onSetFixedTable={setFixedTableTarget}
                    onRemove={setRemoveTarget}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogForm
            onSubmit={async () => {
              if (!renameTarget?.name.trim()) {
                return;
              }
              await run(() =>
                updateParticipant.mutateAsync({
                  id,
                  participantId: renameTarget.participantId,
                  displayName: renameTarget.name.trim(),
                }),
              );
              setRenameTarget(null);
            }}
          >
            <DialogHeader>
              <DialogTitle>Rename participant</DialogTitle>
            </DialogHeader>
            <Input
              value={renameTarget?.name ?? ""}
              maxLength={120}
              onChange={(event) =>
                setRenameTarget((prev) => (prev ? { ...prev, name: event.target.value } : prev))
              }
              aria-label="New name"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRenameTarget(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!renameTarget?.name.trim() || updateParticipant.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>

      <Dialog open={regionTarget !== null} onOpenChange={(open) => !open && setRegionTarget(null)}>
        <DialogContent>
          <DialogForm
            onSubmit={async () => {
              if (!regionTarget) {
                return;
              }
              await run(() =>
                updateParticipant.mutateAsync({
                  id,
                  participantId: regionTarget.participantId,
                  region: regionTarget.region === "none" ? null : regionTarget.region,
                }),
              );
              setRegionTarget(null);
            }}
          >
            <DialogHeader>
              <DialogTitle>Set region for {regionTarget?.name}</DialogTitle>
              <DialogDescription>
                The region this player represents. Pairings avoid same-region matchups.
              </DialogDescription>
            </DialogHeader>
            <RegionSelect
              value={regionTarget?.region ?? "none"}
              onChange={(value) =>
                setRegionTarget((prev) => (prev ? { ...prev, region: value } : prev))
              }
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRegionTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateParticipant.isPending}>
                Save
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>

      <Dialog
        open={fixedTableTarget !== null}
        onOpenChange={(open) => !open && setFixedTableTarget(null)}
      >
        <DialogContent>
          <DialogForm
            onSubmit={async () => {
              if (!fixedTableTarget) {
                return;
              }
              const parsed = parseFixedTable(fixedTableTarget.fixedTable);
              if (parsed === undefined) {
                return;
              }
              await run(() =>
                updateParticipant.mutateAsync({
                  id,
                  participantId: fixedTableTarget.participantId,
                  fixedTable: parsed,
                }),
              );
              setFixedTableTarget(null);
            }}
          >
            <DialogHeader>
              <DialogTitle>Set fixed table for {fixedTableTarget?.name}</DialogTitle>
              <DialogDescription>
                The physical table this player is normally seated at. Pairings are unaffected: when
                two fixed-table players meet, the match goes to the lower table and the other player
                moves for that round.
              </DialogDescription>
            </DialogHeader>
            <Input
              type="number"
              min={1}
              max={999}
              inputMode="numeric"
              value={fixedTableTarget?.fixedTable ?? ""}
              onChange={(event) =>
                setFixedTableTarget((prev) =>
                  prev ? { ...prev, fixedTable: event.target.value } : prev,
                )
              }
              placeholder="No fixed table"
              aria-label="Fixed table number"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setFixedTableTarget(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  updateParticipant.isPending ||
                  parseFixedTable(fixedTableTarget?.fixedTable ?? "") === undefined
                }
              >
                Save
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>

      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogForm
            onSubmit={() => {
              if (removeTarget) {
                fireAction(removeTarget.participantId, "remove");
                setRemoveTarget(null);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
              <DialogDescription>
                This permanently removes them from the tournament, including any decklist they
                submitted, and cannot be undone. If they have already been paired into a round,
                removal is blocked, so drop them instead, which keeps their results but sits them
                out of later rounds.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={participantAction.isPending}>
                Remove
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Parse the fixed-table dialog's draft: empty clears the fixed table (null), a
 * whole number 1..999 sets it, anything else is invalid.
 * @returns The value to save, or undefined when the draft is invalid.
 */
function parseFixedTable(draft: string): number | null | undefined {
  const trimmed = draft.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
    return undefined;
  }
  return parsed;
}

/**
 * Region picker for the set-region dialog: the `region` custom-tag vocabulary
 * (the same one Custom - Region decks use) plus a "No region" option.
 * @returns The region select.
 */
function RegionSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { byCategory } = useCustomTagList();
  const items = [
    { value: "none", label: "No region" },
    ...(byCategory.get("region") ?? []).map((tag) => ({ value: tag.slug, label: tag.label })),
  ];
  return (
    <Select items={items} value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger aria-label="Region">
        <SelectValue placeholder="Region" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The "Add player" call-to-action for the participants top bar: a primary button
 * that opens a dialog asking for the player's name and creates the participant
 * by hand (no account or email). Self-contained so it can sit in the section
 * frame's actions slot.
 * @returns The add-player button and its dialog.
 */
export function AddParticipantButton({ id }: { id: string }) {
  const addParticipant = useAddParticipant();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function submit() {
    const displayName = name.trim();
    if (!displayName) {
      return;
    }
    try {
      await addParticipant.mutateAsync({ id, displayName });
      setName("");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <>
      <PageTopBarPrimaryButton onClick={() => setOpen(true)}>
        <UserPlusIcon className="size-4" />
        Add player
      </PageTopBarPrimaryButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add player</DialogTitle>
            <DialogDescription>
              Add a player by name. They are not linked to an account. Share their claim link later
              so they can attach this spot to their OpenRift account.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Player name"
              aria-label="Player name"
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || addParticipant.isPending}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
