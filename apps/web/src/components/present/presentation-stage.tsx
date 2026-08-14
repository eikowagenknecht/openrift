import { SettingsIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { PresentationFilmstrip } from "@/components/present/presentation-filmstrip";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useIdle } from "@/hooks/use-idle";
import {
  BOARD_ACTIONS,
  isTypingTarget,
  ownsSpaceKey,
  resolvePresentationKey,
} from "@/lib/presentation-keys";
import type { PresentationItem } from "@/lib/presentation-queue";
import { stepIndex } from "@/lib/presentation-queue";
import { cn } from "@/lib/utils";
import { TIER_TILE_WIDTHS, useDisplayStore } from "@/stores/display-store";
import { MAX_CARD_SCALE, MIN_CARD_SCALE, usePresentationStore } from "@/stores/presentation-store";

/** How long the stage waits before fading its own chrome out of the capture. */
const IDLE_DELAY_MS = 2500;

const KEY_HELP: { keys: string[]; what: string }[] = [
  { keys: ["←", "→"], what: "Step through the queue" },
  { keys: ["Space"], what: "Next card" },
  { keys: ["Home", "End"], what: "First / last card" },
  { keys: ["T"], what: "Rules text panel" },
  { keys: ["F"], what: "Thumbnail strip" },
  { keys: ["?"], what: "This help" },
  { keys: ["Esc"], what: "Leave presentation mode" },
];

/** Extra rows shown only when the run has a board behind it. */
const BOARD_KEY_HELP: { keys: string[]; what: string }[] = [
  { keys: ["B"], what: "Whole board / one card" },
  { keys: ["R"], what: "Fill the board as you go" },
  { keys: ["D"], what: "Start from the bottom tier" },
];

/**
 * The keyboard cheat sheet, toggled with `?`.
 * @returns The help sheet overlay.
 */
function PresentationHelpSheet({ boardControls }: { boardControls: boolean }) {
  const rows = boardControls ? [...KEY_HELP, ...BOARD_KEY_HELP] : KEY_HELP;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-8">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2 rounded-lg bg-black/80 px-6 py-5 backdrop-blur-sm">
        {rows.map((row) => (
          <div key={row.what} className="contents">
            <dt className="flex justify-end gap-1">
              {row.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dt>
            <dd className="text-sm text-white/70">{row.what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * One labelled switch in the settings popover, with the key that does the same
 * thing shown beside it.
 * @returns The switch row.
 */
function StageToggleRow({
  id,
  label,
  hotkey,
  checked,
  onToggle,
}: {
  id: string;
  label: string;
  hotkey: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="flex-1">
        {label}
      </Label>
      <Kbd>{hotkey}</Kbd>
      <Switch id={id} checked={checked} onCheckedChange={onToggle} />
    </div>
  );
}

/**
 * The board layout's own settings: which shape the run takes, and how large the
 * tiles on the ladder read. Split out so the card-only sources never render a
 * row for a control that would do nothing.
 *
 * @returns The board rows for the settings popover.
 */
function BoardSettings() {
  const boardMode = usePresentationStore((state) => state.boardMode);
  const reveal = usePresentationStore((state) => state.reveal);
  const direction = usePresentationStore((state) => state.direction);
  const toggleBoard = usePresentationStore((state) => state.toggleBoard);
  const toggleReveal = usePresentationStore((state) => state.toggleReveal);
  const toggleDirection = usePresentationStore((state) => state.toggleDirection);
  const tierTileStep = useDisplayStore((state) => state.tierTileStep);
  const setTierTileStep = useDisplayStore((state) => state.setTierTileStep);

  const handleTileStep = (value: number | readonly number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (typeof next === "number") {
      setTierTileStep(next);
    }
  };

  return (
    <>
      <StageToggleRow
        id="stage-board-mode"
        label="Whole board"
        hotkey="B"
        checked={boardMode}
        onToggle={toggleBoard}
      />
      <StageToggleRow
        id="stage-reveal"
        label="Fill as you go"
        hotkey="R"
        checked={reveal}
        onToggle={toggleReveal}
      />
      <StageToggleRow
        id="stage-direction"
        label="Start at the bottom"
        hotkey="D"
        checked={direction === "worst-first"}
        onToggle={toggleDirection}
      />
      {boardMode && (
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
      )}
    </>
  );
}

/**
 * The stage's settings popover: card size, plus the layers that otherwise only
 * answer to a key. A creator who never reads the help sheet can still find the
 * rules panel and the thumbnail strip.
 *
 * @returns The gear button and its popover.
 */
function StageSettings({
  open,
  onOpenChange,
  boardControls,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardControls: boolean;
}) {
  const showText = usePresentationStore((state) => state.showText);
  const showStrip = usePresentationStore((state) => state.showStrip);
  const showHelp = usePresentationStore((state) => state.showHelp);
  const cardScale = usePresentationStore((state) => state.cardScale);
  const toggleText = usePresentationStore((state) => state.toggleText);
  const toggleStrip = usePresentationStore((state) => state.toggleStrip);
  const toggleHelp = usePresentationStore((state) => state.toggleHelp);
  const setCardScale = usePresentationStore((state) => state.setCardScale);

  const handleScale = (value: number | readonly number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (typeof next === "number") {
      setCardScale(next / 100);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
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
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="stage-card-size">Card size</Label>
            <span className="text-muted-foreground font-mono text-sm tabular-nums">
              {Math.round(cardScale * 100)}%
            </span>
          </div>
          <Slider
            id="stage-card-size"
            aria-label="Card size"
            min={Math.round(MIN_CARD_SCALE * 100)}
            max={Math.round(MAX_CARD_SCALE * 100)}
            step={5}
            value={[Math.round(cardScale * 100)]}
            onValueChange={handleScale}
          />
        </div>
        <StageToggleRow
          id="stage-show-text"
          label="Rules text"
          hotkey="T"
          checked={showText}
          onToggle={toggleText}
        />
        <StageToggleRow
          id="stage-show-strip"
          label="Thumbnail strip"
          hotkey="F"
          checked={showStrip}
          onToggle={toggleStrip}
        />
        <StageToggleRow
          id="stage-show-help"
          label="Key list"
          hotkey="?"
          checked={showHelp}
          onToggle={toggleHelp}
        />
        {boardControls && <BoardSettings />}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The chrome-free frame every presentation runs inside: a near-black ground, the
 * corner markers, the keyboard, the settings popover, the thumbnail strip and
 * the help sheet. What actually fills the middle arrives as `children` — one big
 * card for a deck walk or an ad-hoc queue, a tier board for a ranking — so a new
 * kind of show is a new middle rather than a new stage.
 *
 * Forced into the dark palette regardless of the viewer's theme (the `dark`
 * class on the root) — the shared `CardDetail` parts style themselves from the
 * theme tokens, and a light-theme text panel on a black stage is unreadable.
 *
 * @returns The presentation stage.
 */
export function PresentationStage({
  items,
  index,
  onIndexChange,
  onExit,
  title,
  boardControls = false,
  children,
}: {
  items: PresentationItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
  /** Context line in the corner marker, e.g. the deck's or the list's name. */
  title?: string;
  /** Offers the board layout's keys and settings. Only a ranking has a board. */
  boardControls?: boolean;
  children: ReactNode;
}) {
  const idle = useIdle(IDLE_DELAY_MS);
  const showStrip = usePresentationStore((state) => state.showStrip);
  const showHelp = usePresentationStore((state) => state.showHelp);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const current = items[index];

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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === " " && ownsSpaceKey(event.target)) {
        return;
      }
      const action = resolvePresentationKey(event);
      if (action === null) {
        return;
      }
      // A run with no board leaves those keys alone rather than swallowing them
      // to do nothing.
      if (!boardControls && BOARD_ACTIONS.has(action)) {
        return;
      }
      event.preventDefault();
      const store = usePresentationStore.getState();
      switch (action) {
        case "next": {
          onIndexChange(stepIndex(index, items.length, 1));
          break;
        }
        case "prev": {
          onIndexChange(stepIndex(index, items.length, -1));
          break;
        }
        case "first": {
          onIndexChange(0);
          break;
        }
        case "last": {
          onIndexChange(Math.max(items.length - 1, 0));
          break;
        }
        case "toggleText": {
          store.toggleText();
          break;
        }
        case "toggleStrip": {
          store.toggleStrip();
          break;
        }
        case "toggleHelp": {
          store.toggleHelp();
          break;
        }
        case "toggleBoard": {
          store.toggleBoard();
          break;
        }
        case "toggleReveal": {
          store.toggleReveal();
          break;
        }
        case "toggleDirection": {
          store.toggleDirection();
          break;
        }
        case "exit": {
          // Escape closes the help sheet first, so it never takes the creator
          // out of the show when they only wanted the key list gone.
          if (store.showHelp) {
            store.closeHelp();
          } else {
            onExit();
          }
          break;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [boardControls, index, items.length, onExit, onIndexChange]);

  if (!current) {
    return null;
  }

  // The settings popover holds its trigger visible: a gear that fades out from
  // under the cursor while its own panel is open reads as a glitch.
  const visible = !idle || settingsOpen;
  const fade = cn("transition-opacity duration-700", visible ? "opacity-100" : "opacity-0");
  const chrome = cn("absolute z-10", fade);

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col bg-[#08090c] text-white">
      <div className={cn(chrome, "top-4 left-4 flex items-center gap-1")}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onExit}
          aria-label="Leave presentation mode"
          className="text-white/70 hover:bg-white/10 hover:text-white"
        >
          <XIcon className="size-5" />
        </Button>
        <StageSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          boardControls={boardControls}
        />
      </div>

      <div className={cn(chrome, "top-4 right-4 text-right")}>
        {title && <div className="text-sm text-white/50">{title}</div>}
        <div className="font-mono text-sm tracking-widest text-white/70 uppercase tabular-nums">
          {current.contextLabel ? `${current.contextLabel} · ` : ""}
          {index + 1} / {items.length}
        </div>
      </div>

      {children}

      <div className="flex shrink-0 flex-col">
        {showStrip && (
          <PresentationFilmstrip items={items} index={index} onSelect={onIndexChange} />
        )}
        {/* In flow rather than pinned to the bottom edge: as an overlay it sat
            on top of the thumbnail strip. The row keeps its space when the hint
            fades, so nothing shifts under it. */}
        <div
          className={cn(
            fade,
            "text-2xs pb-4 text-center font-mono tracking-widest text-white/25 uppercase",
          )}
        >
          Press ? for keys
        </div>
      </div>

      {showHelp && <PresentationHelpSheet boardControls={boardControls} />}
    </div>
  );
}
