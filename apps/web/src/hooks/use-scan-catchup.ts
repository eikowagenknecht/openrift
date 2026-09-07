import { DEFAULT_SESSION_OPTIONS } from "@openrift/shared/scan/session";
import type { RgbaImage } from "@openrift/shared/scan/types";
import type { RefObject } from "react";
import { useRef, useState } from "react";

import { errorText } from "@/lib/error-text";
import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey } from "@/lib/scan-bank";
import type { IdentifyAttempt, PendingFrame, UnidentifiedCard } from "@/lib/scan-catchup";
import {
  CATCH_UP_SHORTLIST,
  catchUpVerdict,
  createCatchUpQueue,
  rankedArtworks,
  shouldRunCatchUp,
} from "@/lib/scan-catchup";
import { guideRectIn, snapshotVideoRect } from "@/lib/scan-flight";
import type { ScannerEvents } from "@/lib/scan-locks";
import type { PlacementTally } from "@/lib/scan-placement-counts";
import type { RelockGuard } from "@/lib/scan-relock";
import type { ScanWorkerOutcome, SessionKind } from "@/workers/scan-worker";

export interface ScanCatchUpOptions {
  loaded: LoadedScanBank | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  runningRef: RefObject<boolean>;
  runGenerationRef: RefObject<number>;
  sessionStartRef: RefObject<number>;
  eventsRef: RefObject<ScannerEvents | undefined>;
  relockRef: RefObject<RelockGuard>;
  tallyRef: RefObject<PlacementTally>;
  grabFrame: (video: HTMLVideoElement) => RgbaImage | null;
  processFrame: (
    kind: SessionKind,
    frame: RgbaImage,
    index: number,
    seconds: number,
  ) => Promise<ScanWorkerOutcome | null>;
}

export interface ScanCatchUp {
  pending: UnidentifiedCard[];
  dismiss: (id: string) => void;
  enqueue: (frame: PendingFrame, at: number) => void;
  shouldRun: (settling: boolean, cardInGuide: boolean) => boolean;
  run: () => Promise<void>;
  identifyNow: (onSnapshot?: (snapshot: string | null) => void) => Promise<IdentifyAttempt>;
  reset: () => void;
}

export function useScanCatchUp(options: ScanCatchUpOptions): ScanCatchUp {
  const { loaded, videoRef, runningRef, runGenerationRef, sessionStartRef, eventsRef } = options;
  // Replayed through a second, never-locking session: a single frame can't
  // earn a run, and the live session's run must not be corrupted by it.
  const queueRef = useRef(createCatchUpQueue());
  const busyRef = useRef(false);
  const seqRef = useRef(0);
  const [pending, setPending] = useState<UnidentifiedCard[]>([]);

  function seconds(): number {
    return (performance.now() - sessionStartRef.current) / 1000;
  }

  function shortlist(ranked: ScanWorkerOutcome["outcome"]["ranked"]) {
    return rankedArtworks(ranked, loaded?.artKeys ?? new Map()).slice(0, CATCH_UP_SHORTLIST);
  }

  function verdictFor(winner: ScanWorkerOutcome["outcome"]["winner"]) {
    return catchUpVerdict(
      winner,
      DEFAULT_SESSION_OPTIONS.minInliers,
      DEFAULT_SESSION_OPTIONS.margin,
    );
  }

  function enqueue(frame: PendingFrame, at: number): void {
    seqRef.current += 1;
    queueRef.current.push({
      id: `catchup-${seqRef.current}`,
      frame: frame.frame,
      thumbnail: frame.thumbnail,
      at,
    });
  }

  function shouldRun(settling: boolean, cardInGuide: boolean): boolean {
    return shouldRunCatchUp({
      queued: queueRef.current.size(),
      settling,
      cardInGuide,
      busy: busyRef.current,
    });
  }

  /**
   * Runs through its own session so the live pass's run stays intact; that
   * session never locks, since a lone frame has no run behind it.
   */
  async function run(): Promise<void> {
    const entry = queueRef.current.take();
    if (!entry) {
      return;
    }
    busyRef.current = true;
    const generation = runGenerationRef.current;
    // The optional access lives outside the try on purpose: the React Compiler
    // cannot lower a conditional inside one and bails out of the whole hook.
    let result: ScanWorkerOutcome | null = null;
    try {
      result = await options.processFrame("catchUp", entry.frame, seqRef.current, seconds());
    } catch (catchUpError) {
      // Deliberately swallowed: the card is already counted as a miss and
      // the live pass must not be interrupted.
      console.log(`[scan] catch-up failed: ${errorText(catchUpError, "unknown")}`);
    }
    const outcome = result === null ? null : result.outcome;
    busyRef.current = false;
    if (generation !== runGenerationRef.current || !outcome) {
      return;
    }
    const verdict = verdictFor(outcome.winner);
    console.log(
      `[scan] catch-up ${entry.id}: ${verdict}` +
        `${outcome.winner ? ` ${outcome.winner.key} inliers ${outcome.winner.inliers} vs rival ${outcome.winner.rivalInliers}` : " nothing verified"}`,
    );
    if (verdict === "discard") {
      return;
    }
    if (verdict === "add" && outcome.winner) {
      const winner = outcome.winner;
      // Must decrement by one, not reset: other cards from the same burst
      // may still be genuinely unaccounted for.
      options.tallyRef.current.noteRecovered();
      // Reported like any other lock, so the page's resolve, picker and tray
      // behave identically to a card the live pass caught.
      eventsRef.current?.onLock?.({
        key: winner.key,
        artKey: winner.artKey,
        label: describeKey(loaded?.labels ?? {}, winner.key),
        resolved: false,
        at: Date.now(),
        lockSeconds: outcome.timings.total / 1000,
        framesToLock: 1,
        inliers: winner.inliers,
      });
      return;
    }
    setPending((current) => [
      ...current,
      {
        id: entry.id,
        thumbnail: entry.thumbnail,
        candidates: shortlist(outcome.ranked),
        at: entry.at,
      },
    ]);
  }

  /**
   * Must grab a fresh frame: the published readout can lag behind a stale
   * card while the guide idles or settles.
   */
  async function identifyNow(
    onSnapshot?: (snapshot: string | null) => void,
  ): Promise<IdentifyAttempt> {
    const video = videoRef.current;
    if (!video || !runningRef.current) {
      return { snapshot: null, identified: false, candidates: [] };
    }
    const snapshot = snapshotVideoRect(video, guideRectIn(video.getBoundingClientRect()));
    onSnapshot?.(snapshot);
    const frame = options.grabFrame(video);
    if (!frame) {
      return { snapshot, identified: false, candidates: [] };
    }
    const generation = runGenerationRef.current;
    seqRef.current += 1;
    busyRef.current = true;
    // The optional access lives outside the try on purpose: the React Compiler
    // cannot lower a conditional inside one and bails out of the whole hook.
    let result: ScanWorkerOutcome | null = null;
    try {
      result = await options.processFrame("catchUp", frame, seqRef.current, seconds());
    } catch (identifyError) {
      console.log(`[scan] identify-now failed: ${errorText(identifyError, "unknown")}`);
    }
    busyRef.current = false;
    const outcome = result === null ? null : result.outcome;
    if (!outcome || generation !== runGenerationRef.current) {
      return { snapshot, identified: false, candidates: [] };
    }
    const verdict = verdictFor(outcome.winner);
    console.log(
      `[scan] identify-now: ${verdict}` +
        `${outcome.winner ? ` ${outcome.winner.key} inliers ${outcome.winner.inliers} vs rival ${outcome.winner.rivalInliers}` : " nothing verified"}`,
    );
    if (verdict === "add" && outcome.winner) {
      const winner = outcome.winner;
      // Bypasses the re-lock guard but still counts as an add, or the live
      // pass would lock the same card again and add an unwanted copy.
      options.relockRef.current.note(winner.artKey, performance.now());
      navigator.vibrate?.(50);
      eventsRef.current?.onLock?.({
        key: winner.key,
        artKey: winner.artKey,
        label: describeKey(loaded?.labels ?? {}, winner.key),
        resolved: false,
        at: Date.now(),
        lockSeconds: outcome.timings.total / 1000,
        framesToLock: 1,
        inliers: winner.inliers,
      });
      return { snapshot, identified: true, candidates: [] };
    }
    return { snapshot, identified: false, candidates: shortlist(outcome.ranked) };
  }

  function reset(): void {
    queueRef.current.clear();
    busyRef.current = false;
    setPending([]);
  }

  function dismiss(id: string): void {
    setPending((current) => current.filter((card) => card.id !== id));
  }

  return { pending, dismiss, enqueue, shouldRun, run, identifyNow, reset };
}
