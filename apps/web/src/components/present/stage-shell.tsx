import type { StageGround } from "@openrift/shared/contracts/stage-presets";
import { SettingsIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useIdle } from "@/hooks/use-idle";
import { isTypingTarget } from "@/lib/keyboard-target";
import { cn } from "@/lib/utils";
import { TIER_TILE_WIDTHS, useDisplayStore } from "@/stores/display-store";
import { usePresentationStore } from "@/stores/presentation-store";

const IDLE_DELAY_MS = 2500;

/** Whole classes, not an interpolated colour: Tailwind's scanner needs to see all three, and the two chroma values must match what an OBS filter is set to. */
const GROUND_CLASS: Record<StageGround, string> = {
  black: "bg-[#08090c]",
  green: "bg-[#00ff00]",
  magenta: "bg-[#ff00ff]",
};

export function isChromaGround(ground: StageGround): boolean {
  return ground !== "black";
}

/** A chroma filter keys any partly-opaque pixel partly out, fringing translucent panels; an opaque plate gives content something to composite against instead. */
export function useChromaPlate(): string {
  const ground = usePresentationStore((state) => state.ground);
  return isChromaGround(ground) ? "rounded-lg bg-[#08090c] p-3" : "";
}

export function StageTileSizeSlider() {
  const tierTileStep = useDisplayStore((state) => state.tierTileStep);
  const setTierTileStep = useDisplayStore((state) => state.setTierTileStep);

  const handleTileStep = (value: number | readonly number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (typeof next === "number") {
      setTierTileStep(next);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="stage-tile-size">Board tile size</Label>
      <Slider
        id="stage-tile-size"
        aria-label="Board tile size"
        min={0}
        max={TIER_TILE_WIDTHS.length - 1}
        step={1}
        value={[tierTileStep]}
        onValueChange={handleTileStep}
      />
    </div>
  );
}

interface StageShellProps {
  onExit: () => void;
  exitLabel?: string;
  onEscape?: () => void;
  settings?: ReactNode;
  title?: ReactNode;
  footer?: ReactNode;
  hint?: ReactNode;
  overlay?: ReactNode;
  children: ReactNode;
}

/** Forced into the dark palette regardless of the viewer's theme: the shared `CardDetail` parts style from theme tokens, and light text on a black stage is unreadable. */
export function StageShell({
  onExit,
  exitLabel = "Leave the show",
  onEscape,
  settings,
  title,
  footer,
  hint,
  overlay,
  children,
}: StageShellProps) {
  const idle = useIdle(IDLE_DELAY_MS);
  const ground = usePresentationStore((state) => state.ground);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // The fixed overlay leaves the page's scrollbar visible on the right edge of
  // the capture unless the document itself is locked.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const leave = onEscape ?? onExit;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      leave();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [leave]);

  const visible = !idle || settingsOpen;
  const fade = cn("transition-opacity duration-700", visible ? "opacity-100" : "opacity-0");
  const chrome = cn("absolute z-10", fade);

  return (
    <div className={cn("dark fixed inset-0 z-50 flex flex-col text-white", GROUND_CLASS[ground])}>
      <div className={cn(chrome, "top-4 left-4 flex items-center gap-1")}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onExit}
          aria-label={exitLabel}
          title={exitLabel}
          className="text-white/70 hover:bg-white/10 hover:text-white"
        >
          <XIcon className="size-5" />
        </Button>
        {settings && (
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Presentation settings"
                  className="text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <SettingsIcon className="size-5" />
                </Button>
              }
            />
            <PopoverContent align="start" className="gap-3">
              {settings}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {title && <div className={cn(chrome, "top-4 right-4 text-right")}>{title}</div>}

      {children}

      {(footer || hint) && (
        <div className="flex shrink-0 flex-col">
          {footer}
          {hint && (
            <div
              className={cn(
                fade,
                "text-2xs pb-4 text-center font-mono tracking-widest text-white/25 uppercase",
              )}
            >
              {hint}
            </div>
          )}
        </div>
      )}

      {overlay}
    </div>
  );
}
