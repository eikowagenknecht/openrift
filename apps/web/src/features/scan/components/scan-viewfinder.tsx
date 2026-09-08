import type { RefObject } from "react";

import { ScanGhostPreview } from "@/features/scan/components/scan-ghost-preview";
import { ScanStartPanel } from "@/features/scan/components/scan-start-panel";
import type { EngineProgress } from "@/features/scan/lib/scan-load-progress";
import { cn } from "@/lib/utils";

interface ScanViewfinderProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  active: boolean;
  immersive: boolean;
  ghostImageId: string | null;
  ghostConfidence: number;
  ghostLandscape: boolean;
  ready: boolean;
  cameraAvailable: boolean | null;
  bankLoaded: boolean;
  engineProgress: EngineProgress;
  showPhoneHint: boolean;
  onStart: () => void;
}

export function ScanViewfinder({
  videoRef,
  overlayRef,
  active,
  immersive,
  ghostImageId,
  ghostConfidence,
  ghostLandscape,
  ready,
  cameraAvailable,
  bankLoaded,
  engineProgress,
  showPhoneHint,
  onStart,
}: ScanViewfinderProps) {
  return (
    <>
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no audio track */}
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <ScanGhostPreview
        imageId={ghostImageId}
        confidence={ghostConfidence}
        landscape={ghostLandscape}
        className={cn("absolute right-4", immersive ? "top-20" : "top-4")}
      />
      {!active && (
        <ScanStartPanel
          ready={ready}
          cameraAvailable={cameraAvailable}
          bankLoaded={bankLoaded}
          engineProgress={engineProgress}
          showPhoneHint={showPhoneHint}
          immersive={immersive}
          onStart={onStart}
        />
      )}
    </>
  );
}
