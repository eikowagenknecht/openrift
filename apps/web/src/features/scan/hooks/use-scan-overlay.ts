import { centeredGuideQuad } from "@openrift/shared/scan/session";
import type { Quad } from "@openrift/shared/scan/types";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";

import { lockRingFraction } from "@/features/scan/lib/scan-overlay";
import type { OverlayTarget } from "@/features/scan/lib/scan-overlay-paint";
import {
  createDrawState,
  paintOverlay,
  syncOverlaySize,
} from "@/features/scan/lib/scan-overlay-paint";

export interface ScanOverlayOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  runGenerationRef: RefObject<number>;
}

export interface ScanOverlayTargetInput {
  quad: Quad | null;
  guide: boolean;
  frameWidth: number;
  frameHeight: number;
  turns: number;
  focus: number;
  runLength: number;
  lockRun: number;
}

export interface ScanOverlay {
  overlayRef: RefObject<HTMLCanvasElement | null>;
  /**
   * The pipeline lands 5-15 times a second, too rarely to look like tracking
   * on its own; the animation-frame painter owns drawing from this target.
   */
  setTarget: (input: ScanOverlayTargetInput) => void;
  begin: (generation: number) => void;
  clear: () => void;
}

export function useScanOverlay(options: ScanOverlayOptions): ScanOverlay {
  const { videoRef, runGenerationRef } = options;
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const overlayTargetRef = useRef<OverlayTarget | null>(null);
  const overlayDrawRef = useRef(createDrawState());

  // Kept off the paint cadence: measuring the video every animation frame causes layout thrash.
  useEffect(() => {
    const resize = () => {
      const canvas = overlayRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        syncOverlaySize(canvas, video);
      }
      // Resizing a canvas clears it; the painter must redraw.
      overlayDrawRef.current.settled = false;
      overlayDrawRef.current.shown = false;
    };
    globalThis.addEventListener("resize", resize);
    globalThis.addEventListener("orientationchange", resize);
    return () => {
      globalThis.removeEventListener("resize", resize);
      globalThis.removeEventListener("orientationchange", resize);
    };
  }, [videoRef]);

  function setTarget(input: ScanOverlayTargetInput): void {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      return;
    }
    // The only layout read in the overlay path; must stay on the pipeline
    // cadence, not the painter's.
    syncOverlaySize(canvas, video);
    overlayTargetRef.current = {
      quad: input.quad,
      guide: input.guide ? centeredGuideQuad(input.frameWidth, input.frameHeight) : null,
      frameWidth: input.frameWidth,
      frameHeight: input.frameHeight,
      turns: input.turns,
      focus: input.focus,
      lockFraction: lockRingFraction(input.runLength, input.lockRun),
      lockRun: input.lockRun,
    };
  }

  function begin(generation: number): void {
    overlayTargetRef.current = null;
    overlayDrawRef.current = createDrawState();
    // Declared as a const, like the frame loop: a hook-level function
    // referencing itself by name makes the React Compiler bail out.
    const paint = () => {
      if (generation !== runGenerationRef.current) {
        return;
      }
      const canvas = overlayRef.current;
      const context = canvas === null ? null : canvas.getContext("2d");
      if (canvas && context) {
        paintOverlay(canvas, context, overlayTargetRef.current, overlayDrawRef.current);
      }
      requestAnimationFrame(paint);
    };
    requestAnimationFrame(paint);
  }

  function clear(): void {
    // The bumped generation already ended the paint loop, so the canvas must
    // be cleared here and the target dropped before a restart repaints it.
    overlayTargetRef.current = null;
    const canvas = overlayRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { overlayRef, setTarget, begin, clear };
}
