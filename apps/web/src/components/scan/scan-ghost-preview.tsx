import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { cn } from "@/lib/utils";

/** Blur radius at zero confidence, in pixels. Falls to 0 as the match firms up. */
const MAX_BLUR_PX = 6;
/** Opacity floor — the first weak guess should read as a hint, not an answer. */
const MIN_OPACITY = 0.3;
/** Opacity ceiling — kept under 1 so the camera image stays visible behind it. */
const MAX_OPACITY = 0.95;

/** How the ghost renders at a given confidence. */
export interface GhostAppearance {
  /** Opacity of the whole ghost, `MIN_OPACITY`–`MAX_OPACITY`. */
  opacity: number;
  /** CSS blur radius on the artwork, in pixels. 0 once the engine is certain. */
  blurPx: number;
}

/**
 * Round to two decimals so the inline style string is stable across
 * near-identical confidences and doesn't churn the DOM.
 *
 * @returns The rounded value.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Map a 0–1 confidence to the ghost's visual weight: faint and blurred while
 * the engine is still guessing, sharp and solid once it is sure. Values outside
 * 0–1 (and non-finite ones) are clamped, so a raw engine score can be passed
 * straight through without the caller normalising it first.
 *
 * @returns The opacity and blur radius to render at.
 */
export function ghostAppearance(confidence: number): GhostAppearance {
  const clamped = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0;
  return {
    opacity: round2(MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * clamped),
    blurPx: round2(MAX_BLUR_PX * (1 - clamped)),
  };
}

interface ScanGhostPreviewProps {
  /** Image id of the artwork the engine currently favours. Without it, nothing renders. */
  imageId?: string | null;
  /** How sure the engine is, 0–1. At 0 (or below) nothing renders. */
  confidence: number;
  /** Optional caption under the art — usually the card name. */
  label?: string;
  /** Positioning and sizing from the parent. The ghost never places itself. */
  className?: string;
  /** Landscape art (Battlefields) is rotated to fill the portrait frame. */
  landscape?: boolean;
}

/**
 * The "what am I looking at" ghost that floats over the live camera view. It
 * shows the artwork the engine currently favours and converges as confidence
 * builds: faint and out of focus on a weak guess, opaque and sharp once the
 * match is solid, so the lock never arrives out of nowhere.
 *
 * Purely presentational and cheap on purpose — the appearance is inline style
 * driven by the `confidence` prop with a short CSS transition, never a keyframe
 * animation or a per-frame render loop, so it costs nothing while the camera
 * pipeline runs. The parent positions it (`className`) and updates confidence
 * at whatever rate the engine reports.
 *
 * @returns The ghost, or nothing while there is no candidate to show.
 */
export function ScanGhostPreview({
  imageId,
  confidence,
  label,
  className,
  landscape = false,
}: ScanGhostPreviewProps) {
  if (!imageId || confidence <= 0) {
    return null;
  }
  const { opacity, blurPx } = ghostAppearance(confidence);

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none transition-opacity duration-300", className)}
      style={{ opacity }}
    >
      <div className="rounded-lg bg-black/60 p-1 ring-1 ring-white/30">
        {/* Blur sits on its own wrapper so the plate, ring and label stay crisp
            while the artwork sharpens. */}
        <div className="transition-[filter] duration-300" style={{ filter: `blur(${blurPx}px)` }}>
          <CardArtThumb imageId={imageId} variant="120w" className="w-16" landscape={landscape} />
        </div>
      </div>
      {label && (
        <p className="mt-1 max-w-18 truncate rounded-full bg-black/60 px-2 py-0.5 text-center text-sm text-white">
          {label}
        </p>
      )}
    </div>
  );
}
