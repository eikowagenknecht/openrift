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
import { computePairingWarnings, evaluatePod } from "@openrift/shared";
import { GripVerticalIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReplacePodPairing } from "@/hooks/use-pod-tournaments";
import {
  movePlayer,
  participantIds,
  seedFromRound,
  toPayload,
  validatePartition,
} from "@/lib/pod-pairing-editor";
import type { EditorState, MoveTarget } from "@/lib/pod-pairing-editor";
import { cn } from "@/lib/utils";

import { snapshotToPlayers, WarningList } from "./pairing-warnings";

// Build the non-empty pods as engine pods. Size is the live member count; the
// engine reads it only for the `=== 3` checks, so a transient 2/5 is runtime-safe
// even though the type is narrowed to 3 | 4.
function toEnginePods(state: EditorState): Pod[] {
  return state.pods
    .filter((pod) => pod.playerIds.length > 0)
    .map((pod) => ({ size: pod.playerIds.length as 3 | 4, playerIds: pod.playerIds }));
}

/**
 * Drag-and-drop editor for the open round's pairing. The organizer rearranges
 * players between pods and a bye zone; pods flex in size (a save is blocked until
 * every pod is 3 or 4 and everyone is seated). Penalty and warnings update live.
 *
 * @param id The tournament id.
 * @param round The open (reporting) round being edited.
 * @param snapshot Per-player pre-round aggregates (for penalty + warnings).
 * @param onClose Called after a successful save or a cancel.
 * @returns The editor.
 */
export function PodPairingEditor({
  id,
  round,
  snapshot,
  onClose,
}: {
  id: string;
  round: PodRoundResponse;
  snapshot: PodSnapshotPlayer[];
  onClose: () => void;
}) {
  const [state, setState] = useState<EditorState>(() => seedFromRound(round));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const replace = useReplacePodPairing();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const nameById = new Map<string, string>([
    ...round.pods.flatMap((pod) =>
      pod.members.map((member) => [member.playerId, member.displayName] as const),
    ),
    ...round.byes.map((bye) => [bye.playerId, bye.displayName] as const),
  ]);
  const scoreById = new Map(snapshot.map((player) => [player.playerId, player.score]));
  const players = snapshotToPlayers(snapshot);
  const playersById = new Map(players.map((player) => [player.id, player]));

  const expected = participantIds(seedFromRound(round));
  const validation = validatePartition(state, expected);
  const enginePods = toEnginePods(state);
  const warnings = computePairingWarnings(enginePods, players, state.byes);
  const totalPenalty = enginePods.reduce(
    (sum, pod) => sum + evaluatePod(pod, playersById).total,
    0,
  );

  const podWarnings = new Map<number, PairingWarning[]>();
  for (const warning of warnings) {
    if (
      warning.kind === "rematch" ||
      warning.kind === "largeSpread" ||
      warning.kind === "repeatedThreePod"
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

  async function handleSave() {
    if (!validation.ok) {
      return;
    }
    const payload = toPayload(state);
    try {
      await replace.mutateAsync({ id, roundNumber: round.roundNumber, ...payload });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save pairing");
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
          <h3 className="text-lg font-semibold">Edit round {round.roundNumber} pairing</h3>
          <span className="text-muted-foreground text-sm tabular-nums">
            Penalty {Math.round(totalPenalty)}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          Drag players between pods or into Byes. Every pod must have 3 or 4 players to save.
          Warnings are advisory.
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
        {validation.errors.length > 0 ? (
          <ul className="text-destructive flex flex-col gap-0.5 text-sm">
            {validation.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={replace.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!validation.ok || replace.isPending}>
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
  children,
}: {
  index: number;
  count: number;
  valid: boolean;
  warnings: PairingWarning[];
  nameById: Map<string, string>;
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
          <span>Pod {index + 1}</span>
          <span className={cn("font-normal", valid ? "text-muted-foreground" : "text-destructive")}>
            {count} player{count === 1 ? "" : "s"}
          </span>
        </CardTitle>
        <WarningList warnings={warnings} nameById={nameById} />
      </CardHeader>
      <CardContent className="flex min-h-12 flex-col gap-1.5">{children}</CardContent>
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
