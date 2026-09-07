import { toGray } from "@openrift/shared/scan/image";
import type { PlacementDetector } from "@openrift/shared/scan/placement";
import { createPlacementDetector } from "@openrift/shared/scan/placement";
import { centeredGuideQuad } from "@openrift/shared/scan/session";
import type { RgbaImage } from "@openrift/shared/scan/types";
import type { RefObject } from "react";
import { useRef } from "react";

import type { PendingFrame } from "@/features/scan/lib/scan-catchup";
import { guideRectIn, snapshotVideoRect } from "@/features/scan/lib/scan-flight";
import { grabWatchFrame } from "@/features/scan/lib/scan-frame-grab";
import type { PlacementTally } from "@/features/scan/lib/scan-placement-counts";
import type { ScannerSettings } from "@/features/scan/lib/scan-session";

export interface ScanPlacementsOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  runGenerationRef: RefObject<number>;
  settingsRef: RefObject<ScannerSettings>;
  tallyRef: RefObject<PlacementTally>;
  resetTally: () => void;
  setSettling: (disturbed: boolean, at: number) => void;
  takePendingFrame: () => PendingFrame | null;
  setPendingFrame: (pending: PendingFrame | null) => void;
  grabFrame: (video: HTMLVideoElement) => RgbaImage | null;
  rearm: () => void;
  onMiss: (pending: PendingFrame, now: number) => void;
}

export interface ScanPlacements {
  begin: (generation: number) => void;
}

/**
 * Independent of the pipeline: a phone processing 5 fps can spend a whole
 * second inside two frames, too slow to catch a card landing on its own.
 */
export function useScanPlacements(options: ScanPlacementsOptions): ScanPlacements {
  const { videoRef, runGenerationRef, settingsRef, tallyRef } = options;
  const placementRef = useRef<PlacementDetector | null>(null);
  const watchCanvasRef = useRef<HTMLCanvasElement | null>(null);

  function watchPlacement(video: HTMLVideoElement, now: number): void {
    const detector = placementRef.current;
    if (!detector) {
      return;
    }
    // Written long-hand: the React Compiler cannot lower `??=`.
    if (!watchCanvasRef.current) {
      watchCanvasRef.current = document.createElement("canvas");
    }
    const pixels = grabWatchFrame(video, watchCanvasRef.current);
    if (!pixels) {
      return;
    }
    // Runs in the camera's own frame; rotation compensation doesn't apply
    // since the detector only compares consecutive frames.
    const signal = detector.observe(toGray(pixels), centeredGuideQuad(pixels.width, pixels.height));
    const tally = tallyRef.current;
    // Must update now, not when the next card arrives, or the session's
    // last card goes uncounted.
    options.setSettling(signal.disturbed, now);
    // Single mode only: handheld, "a card came to rest" fires on hand tremor,
    // producing counts and misses for cards never placed at all.
    if (settingsRef.current.mode === "single") {
      return;
    }
    if (tally.takeMiss(now)) {
      // The card is gone, but the frame it settled on remains; recognising it
      // now costs a frame slot the live pass didn't have.
      const pending = options.takePendingFrame();
      if (pending) {
        options.onMiss(pending, now);
      }
    }
    if (!signal.placed) {
      return;
    }
    tally.notePlacement(now);
    // The settle frame is the sharpest view of this card there will be: the
    // motion has stopped and the next thing to happen is the card leaving.
    const frame = options.grabFrame(video);
    options.setPendingFrame(
      frame
        ? {
            frame,
            thumbnail: snapshotVideoRect(video, guideRectIn(video.getBoundingClientRect())),
          }
        : null,
    );
    options.rearm();
  }

  function begin(generation: number): void {
    // Driven by the camera's own frame callback where it exists, sampling
    // every delivered frame, not the render loop's cadence.
    placementRef.current = createPlacementDetector();
    options.resetTally();
    options.setSettling(false, 0);
    const video = videoRef.current;
    if (!video || settingsRef.current.mode === "pan") {
      return;
    }
    const watched = video;
    // Both schedulers hand the callback a performance.now() timestamp, so
    // the watcher is clocked on the frame it's looking at, not on delay.
    const watch = (frameTime: number) => {
      if (generation !== runGenerationRef.current) {
        return;
      }
      watchPlacement(watched, frameTime);
      if (watched.requestVideoFrameCallback) {
        watched.requestVideoFrameCallback(watch);
      } else {
        requestAnimationFrame(watch);
      }
    };
    if (watched.requestVideoFrameCallback) {
      watched.requestVideoFrameCallback(watch);
    } else {
      requestAnimationFrame(watch);
    }
  }

  return { begin };
}
