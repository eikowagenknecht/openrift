import { CameraIcon, CameraOffIcon, ScanSearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScanShutter } from "@/features/scan/components/scan-shutter";
import { ScanLoading, ScanStartHint, ScanTips } from "@/features/scan/components/scan-start-panel";
import type { AimHint } from "@/features/scan/lib/scan-aim-hint";
import type { EngineProgress } from "@/features/scan/lib/scan-load-progress";
import { OVER_VIDEO } from "@/features/scan/lib/scan-styles";

interface ScanControlsProps {
  hint: AimHint | null;
  suggestionLabel: string | null;
  onSuggestionAdd: () => void;
  onSuggestionDismiss: () => void;
  active: boolean;
  immersive: boolean;
  shutter: boolean;
  ready: boolean;
  cameraAvailable: boolean | null;
  bankLoaded: boolean;
  engineProgress: EngineProgress;
  captureMode: boolean;
  onStart: () => void;
  onStop: () => void;
  onCapture: () => void;
  onIdentifyNow: () => void;
}

export function ScanControls({
  hint,
  suggestionLabel,
  onSuggestionAdd,
  onSuggestionDismiss,
  active,
  immersive,
  shutter,
  ready,
  cameraAvailable,
  bankLoaded,
  engineProgress,
  captureMode,
  onStart,
  onStop,
  onCapture,
  onIdentifyNow,
}: ScanControlsProps) {
  return (
    <>
      {hint && (
        <p key={hint.kind} className="rounded-full bg-black/60 px-3 py-1 text-sm text-white">
          {hint.message}
        </p>
      )}
      {suggestionLabel !== null && (
        <div className="flex max-w-[90%] items-center gap-1.5 rounded-full bg-black/70 py-1 pr-1 pl-3 text-sm text-white">
          <span className="truncate">Is it {suggestionLabel.split(" (")[0]}?</span>
          <Button size="sm" onClick={onSuggestionAdd}>
            Add
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/20 hover:text-white"
            onClick={onSuggestionDismiss}
            aria-label="Dismiss suggestion"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      )}
      {immersive && !active && (
        <div className="flex flex-col items-center gap-3 text-white">
          {ready ? (
            <ScanStartHint />
          ) : (
            <ScanLoading bankLoaded={bankLoaded} engineProgress={engineProgress} />
          )}
          <ScanTips className="max-w-64 justify-center text-white/70" />
        </div>
      )}
      {!active && shutter && (
        <ScanShutter
          icon={<CameraIcon />}
          label="Start camera"
          disabled={!ready || cameraAvailable !== true}
          onClick={onStart}
        />
      )}
      {!active && immersive && !shutter && (
        <Button size="lg" disabled={!ready || cameraAvailable !== true} onClick={onStart}>
          <CameraIcon />
          Start camera
        </Button>
      )}
      {active && shutter && (
        <ScanShutter
          icon={<ScanSearchIcon />}
          label={captureMode ? "Scan card" : "Identify now"}
          onClick={captureMode ? onCapture : onIdentifyNow}
        />
      )}
      {active && !shutter && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {captureMode ? (
            <Button size="lg" onClick={onCapture}>
              <CameraIcon />
              Scan card
            </Button>
          ) : (
            <Button size="lg" onClick={onIdentifyNow}>
              <ScanSearchIcon />
              Identify now
            </Button>
          )}
          <Button variant="ghost" onClick={onStop} className={OVER_VIDEO}>
            <CameraOffIcon />
            Stop
          </Button>
        </div>
      )}
    </>
  );
}
