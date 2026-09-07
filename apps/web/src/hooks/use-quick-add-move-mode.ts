import type { CollectionResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useState } from "react";
import { toast } from "sonner";

import { useCopies, useMoveCopies } from "@/hooks/use-copies";
import type { QuickAddVerb } from "@/lib/command-palette-results";
import type { MoveSource } from "@/lib/move-sources";
import {
  buildMoveSources,
  groupMovableCopies,
  MOVE_FROM_ANYWHERE,
  movableCountsByPrinting,
} from "@/lib/move-sources";

/** Kept so Shift+Enter / the minus button can send the copy back where it came from. */
interface MoveRecord {
  copyId: string;
  printingId: string;
  fromCollectionId: string;
}

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
  verb: QuickAddVerb;
  collectionId: string;
  collections?: CollectionResponse[];
  selectionKey: string;
  onMoved?: () => void;
}

/**
 * A plain value swap can't restore "All collections", so the previous pair is
 * carried in `swapUndo` and a second click replays it.
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
 * Moves are optimistic against the history: the record is appended before the
 * mutation and dropped again if it rejects.
 */
export function useQuickAddMoveMode({
  verb,
  collectionId,
  collections,
  selectionKey,
  onMoved,
}: MoveModeOptions) {
  const canMove = (collections?.length ?? 0) >= 2;
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

  const inMoveMode = verb === "move" && canMove;
  const inboxId = collections?.find((col) => col.isInbox)?.id;
  const { from: moveFrom, to: moveTo } = direction;

  const [sourceArmedFor, setSourceArmedFor] = useState({ selectionKey, moveFrom, moveTo });
  if (
    sourceArmedFor.selectionKey !== selectionKey ||
    sourceArmedFor.moveFrom !== moveFrom ||
    sourceArmedFor.moveTo !== moveTo
  ) {
    setSourceArmedFor({ selectionKey, moveFrom, moveTo });
    setSourceIndex(0);
  }

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
      // Toast id is stable per printing, so a held Enter replaces it.
      toast.success(
        `Moved 1× ${legendDisplayName(printing.card)} to ${collectionDisplayName(moveTo)}`,
        { id: `palette-move-${printing.id}` },
      );
      if (onMoved) {
        onMoved();
      }
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
      if (onMoved) {
        onMoved();
      }
    } catch {
      setMoveHistory((prev) => [...prev, record]);
    }
  };

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
