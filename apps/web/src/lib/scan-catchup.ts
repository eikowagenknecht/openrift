import type { FrameWinner } from "@openrift/shared/scan/accept";
import { MAX_FRAME_WEIGHT, frameWeight } from "@openrift/shared/scan/accept";
import type { RgbaImage } from "@openrift/shared/scan/types";

export const CATCH_UP_CAPACITY = 3;

export interface CatchUpEntry {
  id: string;
  frame: RgbaImage;
  thumbnail: string | null;
  at: number;
}

export interface CatchUpQueue {
  push: (entry: CatchUpEntry) => void;
  take: () => CatchUpEntry | null;
  drop: (id: string) => void;
  size: () => number;
  clear: () => void;
}

export function createCatchUpQueue(capacity = CATCH_UP_CAPACITY): CatchUpQueue {
  let entries: CatchUpEntry[] = [];
  return {
    push(entry) {
      entries.push(entry);
      while (entries.length > capacity) {
        entries.shift();
      }
    },
    take() {
      return entries.shift() ?? null;
    },
    drop(id) {
      entries = entries.filter((entry) => entry.id !== id);
    },
    size() {
      return entries.length;
    },
    clear() {
      entries = [];
    },
  };
}

export type CatchUpVerdict = "add" | "ask" | "discard";

export function catchUpVerdict(
  winner: FrameWinner | null,
  minInliers: number,
  margin: number,
): CatchUpVerdict {
  if (!winner) {
    return "discard";
  }
  return frameWeight(winner, minInliers, margin) >= MAX_FRAME_WEIGHT ? "add" : "ask";
}

export function shouldRunCatchUp(input: {
  queued: number;
  settling: boolean;
  cardInGuide: boolean;
  busy: boolean;
}): boolean {
  return input.queued > 0 && !input.busy && !input.settling && !input.cardInGuide;
}
