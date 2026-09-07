import { CameraIcon, LayersIcon, ScanSquareIcon, SunIcon } from "lucide-react";

import { ScanLoadRow } from "@/components/scan/scan-load-row";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/ui/qr-code";
import type { EngineProgress } from "@/hooks/use-scan-engine";
import { getSiteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";

const BRACKET_SIZE = "18%";

const TIPS = [
  { icon: SunIcon, label: "Good light" },
  { icon: ScanSquareIcon, label: "Fill the frame" },
  { icon: LayersIcon, label: "One card at a time" },
];

interface ScanStartPanelProps {
  ready: boolean;
  cameraAvailable: boolean | null;
  bankLoaded: boolean;
  cvReady: boolean;
  embedderReady: boolean;
  engineProgress: EngineProgress;
  showPhoneHint: boolean;
  onStart: () => void;
}

export function ScanStartPanel({
  ready,
  cameraAvailable,
  bankLoaded,
  cvReady,
  embedderReady,
  engineProgress,
  showPhoneHint,
  onStart,
}: ScanStartPanelProps) {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-radial from-neutral-800 to-neutral-950 text-white">
      {/* h-[70%] must match guideRectIn's height fraction. */}
      <div aria-hidden className="absolute aspect-[63/88] h-[70%] border-2 border-white/15">
        <Bracket className="-top-0.5 -left-0.5 border-t-2 border-l-2" />
        <Bracket className="-top-0.5 -right-0.5 border-t-2 border-r-2" />
        <Bracket className="-bottom-0.5 -left-0.5 border-b-2 border-l-2" />
        <Bracket className="-right-0.5 -bottom-0.5 border-r-2 border-b-2" />
      </div>

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

        {/* The tray lives in this browser's local storage; the QR code does
            not carry the scanning session to the phone. */}
        {showPhoneHint && (
          <div className="flex w-full flex-col items-center gap-2 border-t border-white/15 pt-4">
            <p className="font-medium">Better on a phone</p>
            <p className="text-xs text-white/60">Point it at the code to open this page there.</p>
            <QrCode
              value={`${getSiteUrl()}/scan`}
              size={96}
              label="QR code for the scanning page"
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

function Bracket({ className }: { className: string }) {
  return (
    <div
      className={cn("absolute border-white/45", className)}
      style={{ width: BRACKET_SIZE, height: BRACKET_SIZE }}
    />
  );
}
