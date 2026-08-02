import { CameraIcon, LayersIcon, ScanSquareIcon, SunIcon } from "lucide-react";

import { ScanLoadRow } from "@/components/scan/scan-load-row";
import { Button } from "@/components/ui/button";
import type { EngineProgress } from "@/hooks/use-scan-engine";
import { cn } from "@/lib/utils";

/**
 * The bracket legs run this share of each edge, matching `BRACKET_FRACTION` in
 * `scan-overlay.ts` so the drawn reticle lands where the placeholder promised
 * it would.
 */
const BRACKET_SIZE = "18%";

/** Pre-flight advice the live coaching cannot give before the camera runs. */
const TIPS = [
  { icon: SunIcon, label: "Good light" },
  { icon: ScanSquareIcon, label: "Fill the frame" },
  { icon: LayersIcon, label: "One card at a time" },
];

interface ScanStartPanelProps {
  /** The bank, OpenCV and the encoder are all loaded. */
  ready: boolean;
  /** Null until the client has looked; false on http, where there is no camera. */
  cameraAvailable: boolean | null;
  /** Whether the card index itself has arrived, for the loading rows. */
  bankLoaded: boolean;
  cvReady: boolean;
  embedderReady: boolean;
  engineProgress: EngineProgress;
  onStart: () => void;
}

/**
 * What fills the viewfinder before the camera starts.
 *
 * It is a rehearsal of the running scanner rather than an empty box: the same
 * dark plate, the same card-shaped guide with corner brackets in the spot the
 * overlay will draw them, and the primary action sitting inside the guide
 * instead of below the picture. Once the camera runs this unmounts and the real
 * video plus its overlay canvas take over, so the two states line up.
 *
 * @returns The pre-start placeholder.
 */
export function ScanStartPanel({
  ready,
  cameraAvailable,
  bankLoaded,
  cvReady,
  embedderReady,
  engineProgress,
  onStart,
}: ScanStartPanelProps) {
  return (
    // The plate stands in for the camera picture, so it is dark in both themes
    // and carries its own light-on-dark text.
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-radial from-neutral-800 to-neutral-950 text-white">
      {/* The guide: 70% of the box height at card aspect, exactly like
          `guideRectIn`. The 90% width clamp it also applies cannot bite at
          either box aspect (3/4 and 16/9), so the height alone sizes this. */}
      <div aria-hidden className="absolute aspect-[63/88] h-[70%] border-2 border-white/15">
        <Bracket className="-top-0.5 -left-0.5 border-t-2 border-l-2" />
        <Bracket className="-top-0.5 -right-0.5 border-t-2 border-r-2" />
        <Bracket className="-bottom-0.5 -left-0.5 border-b-2 border-l-2" />
        <Bracket className="-right-0.5 -bottom-0.5 border-r-2 border-b-2" />
      </div>

      {/* Roughly the guide's own width at both box aspects, so the copy reads
          as sitting inside the outline without being clamped by it. */}
      <div className="relative flex w-64 max-w-full flex-col items-center gap-4 px-3 text-center">
        {ready ? (
          <>
            <p className="text-white/70">
              Hold a card in the frame and it is added as soon as the scanner recognises it.
            </p>
            <Button onClick={onStart} disabled={cameraAvailable !== true}>
              <CameraIcon />
              Start camera
            </Button>
          </>
        ) : (
          <div className="flex w-full flex-col items-center gap-3">
            <ScanLoadRow label="Card index" done={bankLoaded} />
            <ScanLoadRow label="OpenCV" done={cvReady} progress={engineProgress.opencv} />
            <ScanLoadRow
              label="Recognition model"
              done={embedderReady}
              progress={engineProgress.encoder}
            />
          </div>
        )}
      </div>

      <ul className="absolute inset-x-0 bottom-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 text-xs text-white/60">
        {TIPS.map((tip) => (
          <li key={tip.label} className="flex items-center gap-1.5">
            <tip.icon className="size-3.5" />
            {tip.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One corner of the guide: two legs meeting at a right angle, each running
 * {@link BRACKET_SIZE} of its edge. Which two borders are set decides the
 * corner, so the caller passes them in.
 *
 * @returns The corner element.
 */
function Bracket({ className }: { className: string }) {
  return (
    <div
      className={cn("absolute border-white/45", className)}
      style={{ width: BRACKET_SIZE, height: BRACKET_SIZE }}
    />
  );
}
