import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { PairingWarning, Pod, PodRoundResponse, PodSnapshotPlayer } from "@openrift/shared";
import {
  assignTableNumbers,
  buildTeamUnits,
  computePairingWarnings,
  evaluatePod,
} from "@openrift/shared";
import { GripVerticalIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReplaceTournamentPairing } from "@/hooks/use-tournaments";
import {
  movePlayer,
  participantIds,
  seedFromRound,
  toPayload,
  validatePartition,
} from "@/lib/pod-pairing-editor";
import type { EditorMode, EditorState, MoveTarget } from "@/lib/pod-pairing-editor";
import { teamNamesById } from "@/lib/team-display";
import { cn } from "@/lib/utils";

import { snapshotToPlayers, WarningList } from "./pairing-warnings";

// Build the non-empty pods as engine pods. Size is the live member count; the
// engine reads it only for the `=== 3` checks, so a transient 5 is runtime-safe
// even though the type is narrowed to 2 | 3 | 4.
function toEnginePods(state: EditorState): Pod[] {
  return state.pods
    .filter((pod) => pod.playerIds.length > 0)
    .map((pod) => ({ size: pod.playerIds.length as 2 | 3 | 4, playerIds: pod.playerIds }));
}

/**
 * Drag-and-drop editor for the open round's pairing. The organizer rearranges
 * players between pods, a new-pod zone (spawns a table the round doesn't have),
 * and a bye zone; pods flex in size (a save is blocked until every pod is 3 or 4
 * and everyone is seated). Penalty and warnings update live.
 *
 * @param id The tournament id.
 * @param round The open (reporting) round being edited.
 * @param snapshot Per-player pre-round aggregates (for penalty + warnings).
 * @param mode Which sizes are valid: FFA pods (3/4) or Swiss matches (2).
 * @param regionLabel Region slug -> display label for the region warnings.
 * @param onClose Called after a successful save or a cancel.
 * @returns The editor.
 */
export function PodPairingEditor({
  id,
  round,
  snapshot,
  mode = "pod",
  regionLabel,
  onClose,
}: {
  id: string;
  round: PodRoundResponse;
  snapshot: PodSnapshotPlayer[];
  mode?: EditorMode;
  regionLabel?: (slug: string) => string;
  onClose: () => void;
}) {
  const teamMode = mode === "team";
  const players = snapshotToPlayers(snapshot);
  // In team mode the editor's draggable unit is the TEAM: the state holds team
  // ids (plus the ids of unteamed byed players), and only the save expands
  // them back to the four seated players per match.
  const teams = buildTeamUnits(players);
  const seedState = teamMode ? seedUnitsFromRound(round, teams.teamByPlayer) : seedFromRound(round);
  const [state, setState] = useState<EditorState>(() => seedState);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const replace = useReplaceTournamentPairing();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const nameById = new Map<string, string>([
    ...round.pods.flatMap((pod) =>
      pod.members.map((member) => [member.playerId, member.displayName] as const),
    ),
    ...round.byes.map((bye) => [bye.playerId, bye.displayName] as const),
  ]);
  if (teamMode) {
    const roundRows = round.pods.flatMap((pod) =>
      pod.members.map((member) => ({ teamId: member.teamId, displayName: member.displayName })),
    );
    for (const [teamId, name] of teamNamesById(roundRows)) {
      nameById.set(teamId, name);
    }
  }
  const scoreById = teamMode
    ? new Map(teams.units.map((unit) => [unit.id, unit.score]))
    : new Map(snapshot.map((player) => [player.playerId, player.score]));
  const engineUnits = teamMode ? teams.units : players;
  const unitsById = new Map(engineUnits.map((unit) => [unit.id, unit]));

  const expected = participantIds(seedState);
  const validation = validatePartition(state, expected, mode);
  const enginePods = toEnginePods(state);
  // Preview the table assignment the save will produce, so a seat displacement
  // shows up while the organizer is still editing. (Fixed tables are per player
  // and don't steer team units.)
  const fixedTables = new Map(
    engineUnits.flatMap((unit) => {
      const fixedTable = unit.fixedTable ?? null;
      return fixedTable === null ? [] : [[unit.id, fixedTable] as const];
    }),
  );
  const warnings = computePairingWarnings(
    enginePods,
    engineUnits,
    state.byes,
    assignTableNumbers(enginePods, fixedTables),
  );
  const totalPenalty = enginePods.reduce((sum, pod) => sum + evaluatePod(pod, unitsById).total, 0);

  const podWarnings = new Map<number, PairingWarning[]>();
  for (const warning of warnings) {
    if (
      warning.kind === "rematch" ||
      warning.kind === "largeSpread" ||
      warning.kind === "repeatedThreePod" ||
      warning.kind === "sameRegion" ||
      warning.kind === "fixedSeatDisplaced"
    ) {
      // enginePods drops empties, so its indices match only non-empty pods; map back
      // to the editor pod index for display by counting non-empty pods.
      const editorIndex = nthNonEmptyPodIndex(state, warning.podIndex);
      const list = podWarnings.get(editorIndex) ?? [];
      list.push(warning);
      podWarnings.set(editorIndex, list);
    }
  }
  const byeWarnings = warnings.filter((warning) => warning.kind === "repeatBye");

  function handleDragStart(event: DragStartEvent) {
    setDraggingId((event.active.data.current?.playerId as string | undefined) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const playerId = event.active.data.current?.playerId as string | undefined;
    const target = event.over?.data.current?.target as MoveTarget | undefined;
    if (playerId && target) {
      setState((current) => movePlayer(current, playerId, target));
    }
  }

  // An unteamed byed player is a draggable chip too, but they can only sit
  // out — a match needs two whole teams.
  const seatedNonTeamIds = teamMode
    ? state.pods
        .flatMap((pod) => pod.playerIds)
        .filter((unitId) => !teams.membersByTeam.has(unitId))
    : [];
  const errors = [
    ...validation.errors,
    ...seatedNonTeamIds.map(
      (unitId) => `${nameById.get(unitId) ?? "A player"} has no team and can only sit out.`,
    ),
  ];
  const canSave = validation.ok && seatedNonTeamIds.length === 0;

  async function handleSave() {
    if (!canSave) {
      return;
    }
    const payload = toPayload(state);
    // Team mode edits move team units; the server speaks players, so expand
    // each unit back to its members on the way out.
    const expandUnit = (unitId: string) => teams.membersByTeam.get(unitId) ?? [unitId];
    const expanded = teamMode
      ? {
          pods: payload.pods.map((pod) => {
            const playerIds = pod.playerIds.flatMap(expandUnit);
            return { size: playerIds.length as 2 | 3 | 4, playerIds };
          }),
          byes: payload.byes.flatMap(expandUnit),
        }
      : payload;
    try {
      await replace.mutateAsync({ id, roundNumber: round.roundNumber, ...expanded });
      onClose();
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading as="h3">Edit round {round.roundNumber} pairing</Heading>
          <span className="text-muted-foreground text-sm tabular-nums">
            Penalty {Math.round(totalPenalty)}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          {mode === "team"
            ? "Drag teams between matches, onto New match, or into Byes. Every match must have exactly 2 teams to save. Warnings are advisory."
            : mode === "swiss"
              ? "Drag players between matches, onto New match, or into Byes. Every match must have exactly 2 players to save. Warnings are advisory."
              : "Drag players between pods, onto New pod, or into Byes. Every pod must have 3 or 4 players to save. Warnings are advisory."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.pods.map((pod, index) => (
            <PodDropZone
              key={index}
              index={index}
              count={pod.playerIds.length}
              valid={validation.podValid[index] ?? true}
              warnings={podWarnings.get(index) ?? []}
              nameById={nameById}
              mode={mode}
              regionLabel={regionLabel}
            >
              {pod.playerIds.map((playerId) => (
                <PlayerChip
                  key={playerId}
                  playerId={playerId}
                  name={nameById.get(playerId) ?? "Unknown"}
                  score={scoreById.get(playerId) ?? 0}
                />
              ))}
            </PodDropZone>
          ))}
          <NewPodDropZone mode={mode} />
          <ByeDropZone byeIds={state.byes} warnings={byeWarnings} nameById={nameById}>
            {state.byes.map((playerId) => (
              <PlayerChip
                key={playerId}
                playerId={playerId}
                name={nameById.get(playerId) ?? "Unknown"}
                score={scoreById.get(playerId) ?? 0}
              />
            ))}
          </ByeDropZone>
        </div>
        {errors.length > 0 ? (
          <ul className="text-destructive flex flex-col gap-0.5 text-sm">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={replace.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave || replace.isPending}>
            {replace.isPending ? "Saving…" : "Save pairing"}
          </Button>
        </div>
      </div>
      <DragOverlay>
        {draggingId ? (
          <ChipBody
            name={nameById.get(draggingId) ?? "Unknown"}
            score={scoreById.get(draggingId) ?? 0}
            dragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Seed the team-mode editor from the open round: each pod's members collapse
 * to their team ids (first appearance order), and byes collapse to team ids
 * where a whole team sits out, or stay player ids for unteamed byed players.
 * @returns The initial unit-level partition.
 */
function seedUnitsFromRound(
  round: PodRoundResponse,
  teamByPlayer: ReadonlyMap<string, string>,
): EditorState {
  return {
    pods: round.pods.map((pod) => ({
      playerIds: [...new Set(pod.members.map((member) => member.teamId ?? member.playerId))],
    })),
    byes: [...new Set(round.byes.map((bye) => teamByPlayer.get(bye.playerId) ?? bye.playerId))],
  };
}

// The editor index of the n-th non-empty pod (enginePods drops empties).
function nthNonEmptyPodIndex(state: EditorState, nonEmptyIndex: number): number {
  let seen = -1;
  for (let index = 0; index < state.pods.length; index++) {
    if (state.pods[index].playerIds.length > 0) {
      seen++;
      if (seen === nonEmptyIndex) {
        return index;
      }
    }
  }
  return nonEmptyIndex;
}

function ChipBody({ name, score, dragging }: { name: string; score: number; dragging?: boolean }) {
  return (
    <span
      className={cn(
        "bg-background flex items-center gap-1.5 rounded-md border px-2 py-1",
        dragging && "shadow-lg",
      )}
    >
      <GripVerticalIcon className="text-muted-foreground size-3.5 shrink-0" />
      <span className="font-medium">{name}</span>
      <span className="text-muted-foreground tabular-nums">{score} pts</span>
    </span>
  );
}

function PlayerChip({ playerId, name, score }: { playerId: string; name: string; score: number }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `player:${playerId}`,
    data: { playerId },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn("cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-40")}
      {...listeners}
      {...attributes}
    >
      <ChipBody name={name} score={score} />
    </div>
  );
}

function PodDropZone({
  index,
  count,
  valid,
  warnings,
  nameById,
  mode,
  regionLabel,
  children,
}: {
  index: number;
  count: number;
  valid: boolean;
  warnings: PairingWarning[];
  nameById: Map<string, string>;
  mode: EditorMode;
  regionLabel?: (slug: string) => string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `pod:${index}`,
    data: { target: { kind: "pod", index } satisfies MoveTarget },
  });
  return (
    <Card
      ref={setNodeRef}
      className={cn("gap-2", isOver && "ring-primary ring-2", !valid && "border-destructive")}
    >
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center justify-between gap-2">
          {/* Named by the event's style, not by seat count like pairingLabel():
              a Swiss match being dragged through 1 or 3 players is still a
              match, and renaming it mid-drag would be nonsense. */}
          <span>{mode === "pod" ? `Pod ${index + 1}` : `Match ${index + 1}`}</span>
          <span className={cn("font-normal", valid ? "text-muted-foreground" : "text-destructive")}>
            {mode === "team"
              ? `${count} team${count === 1 ? "" : "s"}`
              : `${count} player${count === 1 ? "" : "s"}`}
          </span>
        </CardTitle>
        <WarningList warnings={warnings} nameById={nameById} regionLabel={regionLabel} />
      </CardHeader>
      <CardContent className="flex min-h-12 flex-col gap-1.5">{children}</CardContent>
    </Card>
  );
}

// A drop target that spawns a fresh pod seated with the dropped player. Always
// visible: without it, players parked in Byes could never form a table the
// round no longer has (e.g. after a mid-round drop emptied one).
function NewPodDropZone({ mode }: { mode: EditorMode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "new-pod",
    data: { target: { kind: "newPod" } satisfies MoveTarget },
  });
  return (
    <Card ref={setNodeRef} className={cn("gap-2 border-dashed", isOver && "ring-primary ring-2")}>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{mode === "pod" ? "New pod" : "New match"}</span>
          <PlusIcon className="text-muted-foreground size-4" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-12 items-center">
        <p className="text-muted-foreground text-sm">
          {mode === "team"
            ? "Drop a team here to open a new match."
            : mode === "swiss"
              ? "Drop a player here to open a new match."
              : "Drop a player here to open a new pod."}
        </p>
      </CardContent>
    </Card>
  );
}

function ByeDropZone({
  byeIds,
  warnings,
  nameById,
  children,
}: {
  byeIds: string[];
  warnings: PairingWarning[];
  nameById: Map<string, string>;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "bye",
    data: { target: { kind: "bye" } satisfies MoveTarget },
  });
  return (
    <Card ref={setNodeRef} className={cn("gap-2 border-dashed", isOver && "ring-primary ring-2")}>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Byes</span>
          <span className="text-muted-foreground font-normal">{byeIds.length} sitting out</span>
        </CardTitle>
        <WarningList warnings={warnings} nameById={nameById} />
      </CardHeader>
      <CardContent className="flex min-h-12 flex-col gap-1.5">{children}</CardContent>
    </Card>
  );
}
