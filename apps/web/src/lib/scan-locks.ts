import type { ArtTrack } from "@openrift/shared/scan/accept";

export const LOCK_HISTORY_LIMIT = 30;

export interface LockedCard {
  key: string;
  artKey: string;
  label: string;
  resolved: boolean;
  at: number;
  lockSeconds: number;
  framesToLock: number;
  inliers: number;
}

export interface PrintingUpdate {
  artKey: string;
  key: string;
  label: string;
  resolved: boolean;
}

export interface ScannerEvents {
  onLock?: (lock: LockedCard) => void;
  onLockResolved?: (update: { artKey: string; key: string; label: string }) => void;
}

export interface LockFromTrackInput {
  track: ArtTrack;
  tapped: boolean;
  totalMs: number;
  inliers: number;
  at: number;
}

export function lockFromTrack(input: LockFromTrackInput): LockedCard {
  const { track, tapped } = input;
  // A capture-mode lock is one deliberate tap, so run time is always
  // 0.00s; what matters there is how long the tap took to process.
  const lockSeconds = tapped
    ? input.totalMs / 1000
    : (track.lockedAt ?? track.runStartSeconds) - track.runStartSeconds;
  return {
    key: track.key,
    artKey: track.artKey,
    label: track.label,
    resolved: track.printingResolved,
    at: input.at,
    lockSeconds,
    framesToLock: tapped ? 1 : (track.framesToLock ?? 0),
    inliers: input.inliers,
  };
}

export function appendLock(locks: readonly LockedCard[], lock: LockedCard): LockedCard[] {
  return [lock, ...locks].slice(0, LOCK_HISTORY_LIMIT);
}

export function resolvePrintingIn(
  locks: readonly LockedCard[],
  update: PrintingUpdate,
): LockedCard[] | null {
  const index = locks.findIndex((lock) => lock.artKey === update.artKey);
  const existing = locks[index];
  if (!existing || existing.key === update.key) {
    return null;
  }
  const refreshed = [...locks];
  refreshed[index] = {
    ...existing,
    key: update.key,
    label: update.label,
    resolved: true,
  };
  return refreshed;
}
