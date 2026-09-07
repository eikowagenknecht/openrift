import { CameraIcon, LayersIcon, ScanSquareIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QrCode } from "@/components/ui/qr-code";
import type { EngineProgress } from "@/hooks/use-scan-engine";
import { scanLoadProgress } from "@/lib/scan-load-progress";
import { getSiteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";

const BRACKET_SIZE = "18%";

const TIPS = [
  { icon: SunIcon, label: "Good light" },
  { icon: ScanSquareIcon, label: "Fill the frame" },
  { icon: LayersIcon, label: "One card at a time" },
];

export function ScanTips({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs", className)}>
      {TIPS.map((tip) => (
        <li key={tip.label} className="flex items-center gap-1.5">
          <tip.icon className="size-3.5" />
          {tip.label}
        </li>
      ))}
    </ul>
  );
}

export function ScanStartHint({ className }: { className?: string }) {
  return (
    <p className={cn("max-w-64 text-center text-white/70", className)}>
      Hold a card in the frame. Recognised cards appear in the list{" "}
      <span className="md:hidden">below</span>
      <span className="hidden md:inline">on the right</span>.
    </p>
  );
}

interface ScanLoadingProps {
  bankLoaded: boolean;
  engineProgress: EngineProgress;
}

export function ScanLoading({ bankLoaded, engineProgress }: ScanLoadingProps) {
  const { percent, phase } = scanLoadProgress(bankLoaded, engineProgress);
  return (
    <div className="flex w-64 max-w-full flex-col items-center gap-3 text-center">
      <p>Getting the scanner ready</p>
      <Progress value={percent} aria-label="Scanner loading progress" className="w-full" />
      <p className="text-sm text-white/60">
        {phase === "downloading" ? "Downloading the recognition model…" : "Starting up…"}
      </p>
    </div>
  );
}

interface ScanStartPanelProps extends ScanLoadingProps {
  ready: boolean;
  cameraAvailable: boolean | null;
  showPhoneHint: boolean;
  immersive: boolean;
  onStart: () => void;
}

export function ScanStartPanel({
  ready,
  cameraAvailable,
  showPhoneHint,
  immersive,
  onStart,
  ...load
}: ScanStartPanelProps) {
  return (
    <div className="[container-type:size] absolute inset-0 grid place-items-center overflow-hidden bg-radial from-neutral-800 to-neutral-950 text-white">
      {/* Same geometry as centeredGuideQuad: 70% of the height, capped at 90% of the width. */}
      <div
        aria-hidden
        className="absolute aspect-[63/88] w-[min(90%,calc(70cqh*63/88))] border-2 border-white/15"
      >
        <Bracket className="-top-0.5 -left-0.5 border-t-2 border-l-2" />
        <Bracket className="-top-0.5 -right-0.5 border-t-2 border-r-2" />
        <Bracket className="-bottom-0.5 -left-0.5 border-b-2 border-l-2" />
        <Bracket className="-right-0.5 -bottom-0.5 border-r-2 border-b-2" />
      </div>

      {!immersive && (
        <div className="relative flex w-64 max-w-full flex-col items-center gap-4 px-3">
          {ready ? (
            <>
              <ScanStartHint />
              <Button onClick={onStart} disabled={cameraAvailable !== true}>
                <CameraIcon />
                Start camera
              </Button>
            </>
          ) : (
            <ScanLoading {...load} />
          )}
        </div>
      )}

      {/* The tray lives in this browser's local storage; the QR code does
          not carry the scanning session to the phone. */}
      {showPhoneHint && (
        <div className="absolute bottom-3 left-3 flex max-w-64 items-center gap-3 rounded-lg bg-white/5 p-2 text-left">
          <QrCode value={`${getSiteUrl()}/scan`} size={64} label="QR code for the scanning page" />
          <span className="min-w-0">
            <span className="block font-medium">Better on a phone</span>
            <span className="block text-xs text-white/60">
              Scan the code to open this page there.
            </span>
          </span>
        </div>
      )}

      {!immersive && (
        <ScanTips className="absolute right-3 bottom-3 justify-end pl-3 text-white/60" />
      )}
    </div>
  );
}

function Bracket({ className }: { className: string }) {
  return (
    <div
      className={cn("absolute border-white/45", className)}
      style={{ width: BRACKET_SIZE, height: BRACKET_SIZE }}
    />
  );
}
