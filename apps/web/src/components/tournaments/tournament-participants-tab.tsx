import type { TournamentDetailResponse, TournamentParticipantResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  CopyIcon,
  EllipsisVerticalIcon,
  LayersIcon,
  Link2Icon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  UnlinkIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SearchInput } from "@/components/filters/search-input";
import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { useTournamentDeckCheckEntries } from "@/hooks/use-tournament-deck-check";
import {
  useAddParticipant,
  useParticipantAction,
  useTournamentParticipants,
  useUpdateParticipant,
} from "@/hooks/use-tournaments";
import { getSiteUrl } from "@/lib/site-config";
import {
  canManageTournament,
  compareParticipantsForList,
  PARTICIPANT_STATUS_LABEL,
} from "@/lib/tournament-display";

type ParticipantAction =
  | "drop"
  | "reactivate"
  | "approve"
  | "deny"
  | "remove"
  | "unlink"
  | "reissue";

/** Copies the participant's claim link so the host can hand it to the player. */
async function copyClaimLink(token: string): Promise<void> {
  await navigator.clipboard.writeText(`${getSiteUrl()}/tournaments/claim/${token}`);
  toast.success("Claim link copied");
}

function statusBadgeVariant(status: TournamentParticipantResponse["status"]) {
  return status === "active" ? ("secondary" as const) : ("outline" as const);
}

export function TournamentParticipantsTab({
  id,
  detail,
}: {
  id: string;
  detail: TournamentDetailResponse;
}) {
  const manage = canManageTournament(detail.myRoles);
  const { data } = useTournamentParticipants(id);
  const participants = data.items.toSorted(compareParticipantsForList);
  const updateParticipant = useUpdateParticipant();
  const participantAction = useParticipantAction();

  // The deck-check endpoint is staff-only, so only fetch when the viewer can
  // manage. Maps each participant to their deck entry so the row can link to it.
  const { data: deckCheck } = useTournamentDeckCheckEntries(id, manage);
  const entryByParticipant = new Map(
    (deckCheck?.entries ?? [])
      .filter((entry) => entry.participantId !== null)
      .map((entry) => [entry.participantId as string, entry]),
  );

  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ participantId: string; name: string } | null>(
    null,
  );
  const [removeTarget, setRemoveTarget] = useState<{ participantId: string; name: string } | null>(
    null,
  );

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

  return (
    <div className="flex flex-col gap-4">
      {participants.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search players"
            ariaLabel="Search players"
            className="w-full max-w-xs"
          />
          <p className="text-muted-foreground text-sm">
            {participants.length} {participants.length === 1 ? "player" : "players"}
          </p>
        </div>
      ) : null}

      {participants.length === 0 ? (
        <p className="text-muted-foreground">No participants yet.</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground">No players match the search.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((participant) => {
            const deckEntry = entryByParticipant.get(participant.id);
            return (
              <li
                key={participant.id}
                className="bg-card flex items-center gap-3 rounded-md border p-3"
              >
                <UserAvatar
                  name={participant.userName ?? participant.displayName}
                  className="size-9 shrink-0"
                />
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{participant.displayName}</span>
                  <Badge variant={statusBadgeVariant(participant.status)}>
                    {PARTICIPANT_STATUS_LABEL[participant.status]}
                  </Badge>
                  {participant.userId ? (
                    <Badge
                      variant="subtle"
                      title={
                        participant.userName
                          ? `Linked to the OpenRift account of ${participant.userName}`
                          : "Linked to an OpenRift account"
                      }
                    >
                      <Link2Icon className="size-3" />
                      {participant.userName ?? "Linked"}
                    </Badge>
                  ) : null}
                </span>
                {manage ? (
                  <span className="flex shrink-0 items-center gap-1">
                    {deckEntry ? (
                      <Button
                        size="sm"
                        render={
                          <Link
                            to="/tournaments/$id/decks/$entryId"
                            params={{ id, entryId: deckEntry.id }}
                          />
                        }
                      >
                        <LayersIcon className="size-4" />
                        Deck
                      </Button>
                    ) : null}
                    {participant.status === "requested" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={participantAction.isPending}
                          onClick={() => fireAction(participant.id, "approve")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={participantAction.isPending}
                          onClick={() => fireAction(participant.id, "deny")}
                        >
                          Deny
                        </Button>
                      </>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button size="sm" variant="ghost" aria-label="Participant actions" />
                        }
                      >
                        <EllipsisVerticalIcon className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            setRenameTarget({
                              participantId: participant.id,
                              name: participant.displayName,
                            })
                          }
                        >
                          <PencilIcon className="size-4" />
                          Rename
                        </DropdownMenuItem>
                        {participant.status === "active" ? (
                          <DropdownMenuItem
                            disabled={participantAction.isPending}
                            onClick={() => fireAction(participant.id, "drop")}
                          >
                            <UserMinusIcon className="size-4" />
                            Drop
                          </DropdownMenuItem>
                        ) : participant.status === "dropped" || participant.status === "no_show" ? (
                          <DropdownMenuItem
                            disabled={participantAction.isPending}
                            onClick={() => fireAction(participant.id, "reactivate")}
                          >
                            <UserPlusIcon className="size-4" />
                            Reactivate
                          </DropdownMenuItem>
                        ) : null}
                        {participant.userId ? (
                          <DropdownMenuItem
                            disabled={participantAction.isPending}
                            onClick={() => fireAction(participant.id, "unlink")}
                          >
                            <UnlinkIcon className="size-4" />
                            Unlink
                          </DropdownMenuItem>
                        ) : participant.claimBlocked ? (
                          <DropdownMenuItem
                            disabled={participantAction.isPending}
                            onClick={() => fireAction(participant.id, "reissue")}
                          >
                            <RotateCcwIcon className="size-4" />
                            Re-issue claim link
                          </DropdownMenuItem>
                        ) : participant.claimToken ? (
                          <DropdownMenuItem
                            onClick={() => {
                              const token = participant.claimToken;
                              if (token) {
                                void copyClaimLink(token);
                              }
                            }}
                          >
                            <CopyIcon className="size-4" />
                            Copy claim link
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            setRemoveTarget({
                              participantId: participant.id,
                              name: participant.displayName,
                            })
                          }
                        >
                          <Trash2Icon className="size-4" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
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
              disabled={!renameTarget?.name.trim() || updateParticipant.isPending}
              onClick={async () => {
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
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
            <DialogDescription>
              This permanently removes them from the tournament, including any decklist they
              submitted, and cannot be undone. If they have already been paired into a round,
              removal is blocked, so drop them instead, which keeps their results but sits them out
              of later rounds.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={participantAction.isPending}
              onClick={() => {
                if (removeTarget) {
                  fireAction(removeTarget.participantId, "remove");
                  setRemoveTarget(null);
                }
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
