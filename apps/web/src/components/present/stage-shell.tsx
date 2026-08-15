import type { StageGround } from "@openrift/shared";
import { SettingsIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useIdle } from "@/hooks/use-idle";
import { isTypingTarget } from "@/lib/presentation-keys";
import { cn } from "@/lib/utils";
import { TIER_TILE_WIDTHS, useDisplayStore } from "@/stores/display-store";
import { usePresentationStore } from "@/stores/presentation-store";

/** How long the stage waits before fading its own chrome out of the capture. */
const IDLE_DELAY_MS = 2500;

/**
 * What each ground paints. Written as whole classes rather than an interpolated
 * colour so Tailwind's scanner sees all three, and so the two keying colours
 * stay the exact values an OBS chroma filter is set to.
 */
const GROUND_CLASS: Record<StageGround, string> = {
  black: "bg-[#08090c]",
  green: "bg-[#00ff00]",
  magenta: "bg-[#ff00ff]",
};

/**
 * Whether the ground is there to be keyed out rather than seen.
 *
 * @returns True for the two chroma colours.
 */
export function isChromaGround(ground: StageGround): boolean {
  return ground !== "black";
}

/**
 * Backing-plate classes for stage content that would otherwise sit straight on
 * the ground.
 *
 * A chroma filter keys on colour, so any pixel that is only partly opaque comes
 * out of it partly green — a fringe around every edge of a translucent panel,
 * and a haze over the dimmed tiles of a spotlit board. An opaque plate under
 * that content gives it something to composite against, so nothing but the
 * plate's own edge ever touches the key.
 *
 * @returns The plate classes on a chroma ground, and nothing on black.
 */
export function useChromaPlate(): string {
  const ground = usePresentationStore((state) => state.ground);
  return isChromaGround(ground) ? "rounded-lg bg-[#08090c] p-3" : "";
}

/**
 * The tier board's tile size, offered wherever a board is on the stage. Shared
 * because a creator who sets the tile size for a ranking show expects the same
 * control when they rank one live, and the value itself is one display
 * preference behind both.
 *
 * @returns The labelled slider.
 */
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
  /** Leaves the stage: the corner button, and Escape unless `onEscape` says otherwise. */
  onExit: () => void;
  /**
   * What the corner button says it goes back to, as its label and its tooltip.
   * Worth naming per source: a creator who opened a ranking from their tier list
   * has no other way of knowing the X puts them back on that page rather than
   * somewhere generic.
   */
  exitLabel?: string;
  /**
   * What Escape does, when the stage has something to dismiss before leaving
   * (the key list). Defaults to `onExit`.
   */
  onEscape?: () => void;
  /** Settings popover contents. Omitted, the gear is not offered at all. */
  settings?: ReactNode;
  /** Top-right corner marker: what is being shown, and where the run is in it. */
  title?: ReactNode;
  /** A row under the main region that stays visible while the chrome fades. */
  footer?: ReactNode;
  /** One line of faded corner text below the footer. */
  hint?: ReactNode;
  /** Anything pinned over the stage, e.g. the key list. */
  overlay?: ReactNode;
  children: ReactNode;
}

/**
 * The chrome-free frame every presentation runs inside: the chosen ground (black
 * to be watched, green or magenta to be keyed out), the exit button and settings
 * popover in one corner, a context marker in the other,
 * and the whole lot fading out once the creator goes quiet so it stays out of
 * the capture. What fills the middle arrives as `children` — one big card for a
 * deck walk, a finished board for a ranking show, an editable board for ranking
 * live — so a new kind of show is a new middle rather than a new stage.
 *
 * Forced into the dark palette regardless of the viewer's theme (the `dark`
 * class on the root) — the shared `CardDetail` parts style themselves from the
 * theme tokens, and a light-theme text panel on a black stage is unreadable.
 *
 * Deliberately knows nothing about a queue: the shell is the frame, and what a
 * key or a click does belongs to whatever is inside it.
 *
 * @returns The stage frame.
 */
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

  // The stage is a fixed overlay inside the app shell, so the page behind it
  // keeps its scrollbar — which lands on the right edge of the capture. Lock
  // the document for as long as the show is up.
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
      // A tier label is edited on the stage itself, so Escape out of a text
      // field must not take the creator out of the show with it.
      if (event.key !== "Escape" || isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      leave();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [leave]);

  // The settings popover holds its trigger visible: a gear that fades out from
  // under the cursor while its own panel is open reads as a glitch.
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
          {/* In flow rather than pinned to the bottom edge: as an overlay it sat
              on top of the thumbnail strip. The row keeps its space when the
              hint fades, so nothing shifts under it. */}
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
