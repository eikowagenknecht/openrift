import { CameraOffIcon, SlidersHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ScanSettingsProps } from "@/features/scan/components/scan-settings-menu";
import { ScanSettingsMenu } from "@/features/scan/components/scan-settings-menu";
import { OVER_VIDEO } from "@/features/scan/lib/scan-styles";
import { cn } from "@/lib/utils";

interface ScanChromeProps {
  active: boolean;
  settings: ScanSettingsProps;
  onStop: () => void;
}

export function ScanChrome({ active, settings, onStop }: ScanChromeProps) {
  return (
    <>
      {active && (
        <Button
          variant="ghost"
          onClick={onStop}
          className={cn("h-11 rounded-full px-4", OVER_VIDEO)}
        >
          <CameraOffIcon />
          Stop
        </Button>
      )}
      <div className="ml-auto">
        <ScanSettingsMenu
          {...settings}
          trigger={
            <Button
              size="icon"
              variant="ghost"
              className={cn("size-11 rounded-full", OVER_VIDEO)}
              aria-label="Scan settings"
            />
          }
          triggerContent={<SlidersHorizontalIcon className="size-4" />}
        />
      </div>
    </>
  );
}
