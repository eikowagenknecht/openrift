import { CardArtThumb } from "@/features/cards/components/card-art-thumb";
import { cn } from "@/lib/utils";

const MAX_BLUR_PX = 6;
const MIN_OPACITY = 0.3;
const MAX_OPACITY = 0.95;

export interface GhostAppearance {
  opacity: number;
  /** px */
  blurPx: number;
}

// Rounded so the inline style string is stable across near-identical
// confidences and doesn't churn the DOM.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Confidence outside 0-1 (and non-finite) is clamped, so a raw engine score
// can be passed straight through without the caller normalising it first.
export function ghostAppearance(confidence: number): GhostAppearance {
  const clamped = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0;
  return {
    opacity: round2(MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * clamped),
    blurPx: round2(MAX_BLUR_PX * (1 - clamped)),
  };
}

interface ScanGhostPreviewProps {
  imageId?: string | null;
  confidence: number;
  label?: string;
  className?: string;
  landscape?: boolean;
}

// Floats the artwork the engine currently favours over the live camera view,
// converging from faint/blurred to sharp/opaque as confidence builds.
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
        {/* Blur is on its own wrapper so the plate, ring and label stay crisp. */}
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
