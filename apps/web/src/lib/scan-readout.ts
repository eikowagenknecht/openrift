import type { RankedEmbed } from "@openrift/shared/scan/embed";
import type { FrameOutcome } from "@openrift/shared/scan/session";
import type { CardCandidate } from "@openrift/shared/scan/types";

import type { AimHint, AimHintInput } from "@/lib/scan-aim-hint";
import type { LockedCard } from "@/lib/scan-locks";

const RANKED_SHOWN = 5;

export interface ScannerReadout {
  candidate: CardCandidate | null;
  ranked: RankedEmbed[];
  winnerKey: string | null;
  winnerInliers: number;
  rivalInliers: number;
  refused: boolean;
  bestInliers: number;
  focus: number;
  fps: number;
  detectMs: number;
  embedMs: number;
  verifyMs: number;
  totalMs: number;
  locks: LockedCard[];
  aim: { artKey: string; key: string; seconds: number } | null;
  lockProgress: { runLength: number; lockRun: number };
  candidateAreaFraction: number;
  placements: number;
  missedPlacements: number;
  missedSinceNamed: number;
  settling: boolean;
  aimHint: AimHint | null;
}

export const EMPTY_READOUT: ScannerReadout = {
  candidate: null,
  ranked: [],
  winnerKey: null,
  winnerInliers: 0,
  rivalInliers: 0,
  refused: false,
  bestInliers: 0,
  focus: 0,
  fps: 0,
  detectMs: 0,
  embedMs: 0,
  verifyMs: 0,
  totalMs: 0,
  locks: [],
  aim: null,
  lockProgress: { runLength: 0, lockRun: 0 },
  candidateAreaFraction: 0,
  placements: 0,
  missedPlacements: 0,
  missedSinceNamed: 0,
  settling: false,
  aimHint: null,
};

export function aimHintInputFor(
  outcome: FrameOutcome,
  candidateAreaFraction: number,
  settling: boolean,
): AimHintInput {
  return {
    active: true,
    hasCandidate: outcome.candidate !== null,
    candidateAreaFraction,
    bestInliers: outcome.bestInliers,
    focus: outcome.focus,
    topDistance: outcome.ranked[0]?.distance,
    refused: outcome.refused,
    isWinner: outcome.winner !== null,
    settling,
  };
}

export interface ReadoutInput {
  outcome: FrameOutcome;
  aim: ScannerReadout["aim"];
  aimHint: AimHint | null;
  fps: number;
  locks: LockedCard[];
  runLength: number;
  lockRun: number;
  candidateAreaFraction: number;
  placements: number;
  missedPlacements: number;
  missedSinceNamed: number;
  settling: boolean;
}

export function buildReadout(input: ReadoutInput): ScannerReadout {
  const { outcome } = input;
  return {
    candidate: outcome.candidate,
    ranked: outcome.ranked.slice(0, RANKED_SHOWN),
    winnerKey: outcome.winner === null ? null : outcome.winner.key,
    winnerInliers: outcome.winner === null ? 0 : outcome.winner.inliers,
    rivalInliers: outcome.winner === null ? 0 : outcome.winner.rivalInliers,
    refused: outcome.refused,
    bestInliers: outcome.bestInliers,
    focus: outcome.focus,
    fps: input.fps,
    detectMs: outcome.timings.detect,
    embedMs: outcome.timings.embed,
    verifyMs: outcome.timings.verify,
    totalMs: outcome.timings.total,
    locks: input.locks,
    aim: input.aim,
    lockProgress: { runLength: input.runLength, lockRun: input.lockRun },
    candidateAreaFraction: input.candidateAreaFraction,
    placements: input.placements,
    missedPlacements: input.missedPlacements,
    missedSinceNamed: input.missedSinceNamed,
    settling: input.settling,
    aimHint: input.aimHint,
  };
}
