import { suggestedRoundCount } from "@openrift/shared";
import type { PodTournamentDetailResponse } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAddPodPlayer,
  useDeletePodTournament,
  useDropPodPlayer,
  useFinalizePodRound,
  useGeneratePodRound,
  useReactivatePodPlayer,
  useRemovePodPlayer,
  useRenamePodPlayer,
  useRerollPodRound,
  useSetPodReportToken,
  useSubmitPodResult,
  useUpdatePodTournament,
} from "@/hooks/use-pod-tournaments";
import { getSiteUrl } from "@/lib/site-config";

import { PairingsView } from "./pairings-view";

export function PairingsTab({ id, data }: { id: string; data: PodTournamentDetailResponse }) {
  const generateRound = useGeneratePodRound();
  const rerollRound = useRerollPodRound();
  const finalizeRound = useFinalizePodRound();
  const submitResult = useSubmitPodResult();

  const scoresByPlayer = new Map(data.standings.map((row) => [row.playerId, row.score]));
  const openRound = data.rounds.find((round) => round.status === "reporting");
  const completed = data.tournament.status === "completed";
  const finalizedCount = data.rounds.filter((round) => round.status === "finalized").length;
  const activeCount = data.players.filter((player) => player.status === "active").length;
  const suggested = suggestedRoundCount(activeCount);
  const reachedSuggestion = suggested > 0 && finalizedCount >= suggested;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {completed ? (
        <p className="text-muted-foreground text-sm">
          This tournament is over (read-only). Reopen it in Settings to make changes.
        </p>
      ) : suggested > 0 ? (
        <p className="text-muted-foreground text-sm">
          Swiss suggests about {suggested} round{suggested === 1 ? "" : "s"} for {activeCount}{" "}
          active player{activeCount === 1 ? "" : "s"}; {finalizedCount} finalized so far.
        </p>
      ) : null}
      {!openRound && !completed ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={generateRound.isPending}
            onClick={() => void run(() => generateRound.mutateAsync({ id }))}
          >
            {data.rounds.length === 0 ? "Generate round 1" : "Generate next round"}
          </Button>
          {reachedSuggestion ? (
            <span className="text-muted-foreground text-sm">
              Suggested {suggested} rounds reached. End the tournament in Settings, or keep going.
            </span>
          ) : null}
        </div>
      ) : null}
      {finalizedCount > 1 ? (
        <p className="text-muted-foreground text-sm">
          Editing a finalized round fixes scores, but it does not redraw pods that later rounds
          already used.
        </p>
      ) : null}
      <PairingsView
        rounds={data.rounds}
        scoresByPlayer={scoresByPlayer}
        showPenalty
        canEnterResult={() => !completed}
        onSubmitResult={(podId, placements) =>
          run(() => submitResult.mutateAsync({ id, podId, placements }))
        }
        renderRoundActions={(round) => {
          if (round.status !== "reporting") {
            return null;
          }
          const allReported = round.pods.every((pod) => pod.resultStatus === "reported");
          const anyReported = round.pods.some((pod) => pod.resultStatus === "reported");
          return (
            <>
              <Button
                size="sm"
                variant="destructive"
                disabled={anyReported || rerollRound.isPending}
                onClick={() =>
                  void run(() => rerollRound.mutateAsync({ id, roundNumber: round.roundNumber }))
                }
              >
                Re-roll
              </Button>
              <Button
                size="sm"
                disabled={!allReported || finalizeRound.isPending}
                onClick={() =>
                  void run(() => finalizeRound.mutateAsync({ id, roundNumber: round.roundNumber }))
                }
              >
                Finalize round
              </Button>
            </>
          );
        }}
        emptyMessage="No rounds yet. Generate the first round to begin."
      />
    </div>
  );
}

export function PlayersTab({ id, data }: { id: string; data: PodTournamentDetailResponse }) {
  const addPlayer = useAddPodPlayer();
  const dropPlayer = useDropPodPlayer();
  const reactivatePlayer = useReactivatePodPlayer();
  const removePlayer = useRemovePodPlayer();
  const renamePlayer = useRenamePodPlayer();
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ playerId: string; name: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ playerId: string; name: string } | null>(null);
  const completed = data.tournament.status === "completed";

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  async function handleAdd() {
    const displayName = newName.trim();
    if (!displayName) {
      return;
    }
    await run(() => addPlayer.mutateAsync({ id, displayName }));
    setNewName("");
  }

  return (
    <div className="flex flex-col gap-4">
      {completed ? (
        <p className="text-muted-foreground text-sm">
          The tournament is over. Reopen it in Settings to change the roster.
        </p>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAdd();
          }}
        >
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={80}
            placeholder="Player name"
            aria-label="Player name"
          />
          <Button type="submit" disabled={!newName.trim() || addPlayer.isPending}>
            Add
          </Button>
        </form>
      )}

      {data.players.length === 0 ? (
        <p className="text-muted-foreground">No players yet. Add a few to get started.</p>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {data.players.map((player) => (
            <li key={player.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="flex items-center gap-2">
                <span className="font-medium">{player.displayName}</span>
                {player.status === "dropped" ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Dropped
                  </Badge>
                ) : null}
              </span>
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={completed}
                  onClick={() => setRenameTarget({ playerId: player.id, name: player.displayName })}
                >
                  Rename
                </Button>
                {player.status === "active" ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={completed}
                    onClick={() => setDropTarget({ playerId: player.id, name: player.displayName })}
                  >
                    Drop
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={completed || reactivatePlayer.isPending}
                    onClick={() =>
                      void run(() => reactivatePlayer.mutateAsync({ id, playerId: player.id }))
                    }
                  >
                    Reactivate
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={completed || removePlayer.isPending}
                  onClick={() =>
                    void run(() => removePlayer.mutateAsync({ id, playerId: player.id }))
                  }
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename player</DialogTitle>
          </DialogHeader>
          <Input
            value={renameTarget?.name ?? ""}
            maxLength={80}
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
              disabled={!renameTarget?.name.trim() || renamePlayer.isPending}
              onClick={async () => {
                if (!renameTarget?.name.trim()) {
                  return;
                }
                await run(() =>
                  renamePlayer.mutateAsync({
                    id,
                    playerId: renameTarget.playerId,
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

      <Dialog open={dropTarget !== null} onOpenChange={(open) => !open && setDropTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drop {dropTarget?.name}?</DialogTitle>
            <DialogDescription>
              They will be left out of future rounds. Their results are kept, and you can reactivate
              them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDropTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={dropPlayer.isPending}
              onClick={async () => {
                if (!dropTarget) {
                  return;
                }
                await run(() => dropPlayer.mutateAsync({ id, playerId: dropTarget.playerId }));
                setDropTarget(null);
              }}
            >
              Drop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SettingsTab({ id, data }: { id: string; data: PodTournamentDetailResponse }) {
  const navigate = useNavigate();
  const updateTournament = useUpdatePodTournament();
  const deleteTournament = useDeletePodTournament();
  const setReportToken = useSetPodReportToken();
  const tournament = data.tournament;
  const [name, setName] = useState(tournament.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reportLinkConfirm, setReportLinkConfirm] = useState<"rotate" | "disable" | null>(null);

  const reportUrl = tournament.reportToken
    ? `${getSiteUrl()}/tournaments/run/report/${tournament.reportToken}`
    : null;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <section className="flex flex-col gap-2">
        <Label htmlFor="pt-rename">Name</Label>
        <div className="flex gap-2">
          <Input
            id="pt-rename"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            disabled={!name.trim() || name.trim() === tournament.name || updateTournament.isPending}
            onClick={() => void run(() => updateTournament.mutateAsync({ id, name: name.trim() }))}
          >
            Save
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Status</h2>
        {tournament.status === "completed" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground">This tournament is completed and read-only.</p>
            <Button
              variant="secondary"
              onClick={() =>
                void run(() => updateTournament.mutateAsync({ id, status: "running" }))
              }
            >
              Reopen
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground">End the tournament to make it read-only.</p>
            <Button
              variant="secondary"
              disabled={tournament.status === "setup"}
              onClick={() =>
                void run(() => updateTournament.mutateAsync({ id, status: "completed" }))
              }
            >
              End tournament
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Participant link</h2>
        <p className="text-muted-foreground">
          Share this so players can follow along and report the result for their own pod. Anyone
          with the link can submit a pending result; nothing counts until you finalize the round.
        </p>
        {reportUrl ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input readOnly value={reportUrl} aria-label="Participant link" />
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(reportUrl);
                  toast.success("Link copied");
                }}
              >
                Copy
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={setReportToken.isPending}
                onClick={() => setReportLinkConfirm("rotate")}
              >
                Rotate
              </Button>
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={setReportToken.isPending}
                onClick={() => setReportLinkConfirm("disable")}
              >
                Disable
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="w-fit"
            disabled={setReportToken.isPending}
            onClick={() => void run(() => setReportToken.mutateAsync({ id, enabled: true }))}
          >
            Enable participant link
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-destructive font-semibold">Danger zone</h2>
        <Button variant="destructive" className="w-fit" onClick={() => setConfirmDelete(true)}>
          Delete tournament
        </Button>
      </section>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {tournament.name}?</DialogTitle>
            <DialogDescription>
              This permanently removes the tournament, its players, rounds, and results. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteTournament.isPending}
              onClick={async () => {
                await run(async () => {
                  await deleteTournament.mutateAsync(id);
                  await navigate({ to: "/tournaments/run" });
                });
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reportLinkConfirm !== null}
        onOpenChange={(open) => !open && setReportLinkConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reportLinkConfirm === "disable"
                ? "Disable the participant link?"
                : "Rotate the participant link?"}
            </DialogTitle>
            <DialogDescription>
              {reportLinkConfirm === "disable"
                ? "The current link stops working immediately for everyone. You can re-enable it later, which generates a fresh link."
                : "The current link stops working immediately; re-share the new one with the table."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportLinkConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={setReportToken.isPending}
              onClick={async () => {
                const enabled = reportLinkConfirm === "rotate";
                await run(() => setReportToken.mutateAsync({ id, enabled }));
                setReportLinkConfirm(null);
              }}
            >
              {reportLinkConfirm === "disable" ? "Disable" : "Rotate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
