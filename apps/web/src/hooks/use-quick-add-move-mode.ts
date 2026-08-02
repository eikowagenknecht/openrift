import type { CollectionResponse, Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useCopies, useMoveCopies } from "@/hooks/use-copies";
import type { MoveSource } from "@/lib/move-sources";
import {
  buildMoveSources,
  groupMovableCopies,
  MOVE_FROM_ANYWHERE,
  movableCountsByPrinting,
} from "@/lib/move-sources";

/** One palette-session move, kept so Shift+Enter / the minus button can send the copy back where it came from. */
interface MoveRecord {
  copyId: string;
  printingId: string;
  fromCollectionId: string;
}

/** The From/To direction, plus the value pair a second swap click restores. */
export interface MoveDirection {
  from: string;
  to: string;
  swapUndo: { from: string; to: string } | null;
}

interface SelectOption {
  value: string;
  label: string;
}

interface MoveModeOptions {
  /** The collection the palette opened on — the initial move target. */
  collectionId: string;
  /** The viewer's collections. Move mode needs at least two to be useful. */
  collections?: CollectionResponse[];
  /**
   * Identifies the printing row the palette has selected. Changing it resets
   * the active source chip, the same way changing direction does.
   */
  selectionKey: string;
  /** Called after a move or an undo-move lands, so the palette can refocus its input. */
  onMoved?: () => void;
}

/**
 * Computes the next From/To pair for the swap button. A plain value swap can't
 * restore "All collections", so the previous pair is carried in `swapUndo` and
 * a second click replays it. When From is "All collections" there is nothing to
 * put in the target slot, so From anchors to the old target and the destination
 * defaults to the inbox — or, when the inbox IS the old target (i.e. the user
 * is clearing it out), to the first other collection.
 * @returns The next direction, or null when no swap is possible.
 */
export function resolveSwapDirection(
  current: MoveDirection,
  collections: readonly CollectionResponse[] | undefined,
  inboxId: string | undefined,
): MoveDirection | null {
  if (current.swapUndo) {
    return { from: current.swapUndo.from, to: current.swapUndo.to, swapUndo: null };
  }
  const swapUndo = { from: current.from, to: current.to };
  if (current.from !== MOVE_FROM_ANYWHERE) {
    return { from: current.to, to: current.from, swapUndo };
  }
  const target =
    inboxId && inboxId !== current.to
      ? inboxId
      : collections?.find((col) => col.id !== current.to)?.id;
  if (!target) {
    return null;
  }
  return { from: current.to, to: target, swapUndo };
}

/**
 * The palette's Move mode: instead of creating new copies it reassigns
 * existing ones, From (a source collection, or anywhere) → To (defaults to the
 * collection the palette opened on). Both sides are pickable, so the same
 * palette pulls cards into a fresh deckbox or clears the inbox out into one.
 *
 * Owns the direction, the per-session move history that backs undo, and the
 * active source chip. Moves are optimistic against the history: the record is
 * appended before the mutation and dropped again if it rejects, so a failed
 * move doesn't leave an undo entry pointing at a copy that never moved.
 * @returns The move-mode state and actions.
 */
export function useQuickAddMoveMode({
  collectionId,
  collections,
  selectionKey,
  onMoved,
}: MoveModeOptions) {
  const canMove = (collections?.length ?? 0) >= 2;
  const [mode, setMode] = useState<"add" | "move">("add");
  const [direction, setDirection] = useState<MoveDirection>({
    from: MOVE_FROM_ANYWHERE,
    to: collectionId,
    swapUndo: null,
  });
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  // Which source collection Enter moves from, as an index into the selected
  // printing's source list (ArrowRight/Tab cycles it, clicking a chip sets it).
  const [sourceIndex, setSourceIndex] = useState(0);
  const moveCopies = useMoveCopies();
  // Live rows across all collections; the palette only mounts this hook while
  // it is open, so the subscription doesn't outlive it.
  const { data: allCopies } = useCopies();

  const inMoveMode = mode === "move" && canMove;
  const inboxId = collections?.find((col) => col.isInbox)?.id;
  const { from: moveFrom, to: moveTo } = direction;

  // A new printing row, direction, or target starts back at the default source.
  useEffect(() => {
    setSourceIndex(0);
  }, [selectionKey, moveFrom, moveTo]);

  const movableByPrinting = inMoveMode
    ? groupMovableCopies(allCopies, {
        excludeCollectionId: moveTo,
        onlyCollectionId: moveFrom === MOVE_FROM_ANYWHERE ? undefined : moveFrom,
      })
    : null;
  const movableCounts = movableByPrinting ? movableCountsByPrinting(movableByPrinting) : undefined;

  const fromItems: SelectOption[] = [
    { value: MOVE_FROM_ANYWHERE, label: "All collections" },
    ...(collections ?? [])
      .filter((col) => col.id !== moveTo)
      .map((col) => ({ value: col.id, label: col.name })),
  ];
  const toItems: SelectOption[] = (collections ?? [])
    .filter((col) => col.id !== moveFrom)
    .map((col) => ({ value: col.id, label: col.name }));

  const collectionDisplayName = (id: string) =>
    collections?.find((col) => col.id === id)?.name ?? "collection";

  const sourcesFor = (printingId: string): MoveSource[] =>
    buildMoveSources(movableByPrinting?.get(printingId) ?? [], inboxId);

  const movedCount = (printingId: string) =>
    inMoveMode ? moveHistory.filter((entry) => entry.printingId === printingId).length : 0;

  const moveOne = async (printing: Printing, sourceCollectionId?: string) => {
    const sources = sourcesFor(printing.id);
    const source = sourceCollectionId
      ? sources.find((s) => s.collectionId === sourceCollectionId)
      : sources[Math.min(sourceIndex, sources.length - 1)];
    const copyId = source?.copyIds[0];
    if (!source || !copyId) {
      return;
    }
    const record: MoveRecord = {
      copyId,
      printingId: printing.id,
      fromCollectionId: source.collectionId,
    };
    setMoveHistory((prev) => [...prev, record]);
    try {
      await moveCopies.mutateAsync({ copyIds: [copyId], toCollectionId: moveTo });
      // Stable id per printing: a held Enter replaces the toast instead of
      // stacking one per keypress. Error toasts come from the global
      // mutation onError in query-client.ts.
      toast.success(
        `Moved 1× ${legendDisplayName(printing.card)} to ${collectionDisplayName(moveTo)}`,
        { id: `palette-move-${printing.id}` },
      );
      onMoved?.();
    } catch {
      // Roll the session history back; the global onError already toasted.
      setMoveHistory((prev) => prev.filter((entry) => entry !== record));
    }
  };

  const undoMove = async (printing: Printing) => {
    const record = moveHistory.findLast((entry) => entry.printingId === printing.id);
    if (!record) {
      return;
    }
    setMoveHistory((prev) => prev.filter((entry) => entry !== record));
    try {
      await moveCopies.mutateAsync({
        copyIds: [record.copyId],
        toCollectionId: record.fromCollectionId,
      });
      toast.success(
        `Moved 1× ${legendDisplayName(printing.card)} back to ${collectionDisplayName(record.fromCollectionId)}`,
        { id: `palette-move-${printing.id}` },
      );
      onMoved?.();
    } catch {
      setMoveHistory((prev) => [...prev, record]);
    }
  };

  // Manually picking either side clears the swap-undo pair: it described a
  // direction the user has now edited, so replaying it would be surprising.
  const chooseMoveFrom = (from: string) => setDirection({ from, to: moveTo, swapUndo: null });
  const chooseMoveTo = (to: string) => setDirection({ from: moveFrom, to, swapUndo: null });

  const handleSwapDirection = () => {
    const next = resolveSwapDirection(direction, collections, inboxId);
    if (next) {
      setDirection(next);
    }
  };

  return {
    canMove,
    inMoveMode,
    mode,
    setMode,
    toggleMode: () => setMode((prev) => (prev === "add" ? "move" : "add")),
    moveFrom,
    moveTo,
    chooseMoveFrom,
    chooseMoveTo,
    handleSwapDirection,
    fromItems,
    toItems,
    sourceIndex,
    setSourceIndex,
    sourcesFor,
    movableCounts,
    movedCount,
    collectionDisplayName,
    moveOne,
    undoMove,
  };
}
