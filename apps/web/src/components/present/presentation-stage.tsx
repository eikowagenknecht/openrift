import { legendDisplayName } from "@openrift/shared";
import { SettingsIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { CardDetailArt } from "@/components/cards/card-detail/card-detail-art";
import { CardDetailStats } from "@/components/cards/card-detail/card-detail-stats";
import { CardDetailText } from "@/components/cards/card-detail/card-detail-text";
import { PresentationFilmstrip } from "@/components/present/presentation-filmstrip";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useZoneOrder } from "@/hooks/use-enums";
import { useIdle } from "@/hooks/use-idle";
import { formatPublicCode } from "@/lib/format";
import { isTypingTarget, ownsSpaceKey, resolvePresentationKey } from "@/lib/presentation-keys";
import { stepIndex } from "@/lib/presentation-queue";
import { cn } from "@/lib/utils";
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

/**
 * The keyboard cheat sheet, toggled with `?`.
 * @returns The help sheet overlay.
 */
function PresentationHelpSheet() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-8">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2 rounded-lg bg-black/80 px-6 py-5 backdrop-blur-sm">
        {KEY_HELP.map((row) => (
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
 * The stage's settings popover: card size, plus the layers that otherwise only
 * answer to a key. A creator who never reads the help sheet can still find the
 * rules panel and the thumbnail strip.
 *
 * @returns The gear button and its popover.
 */
function StageSettings({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      </PopoverContent>
    </Popover>
  );
}

/**
 * The rules-text side panel, toggled with `T`.
 *
 * Fixed width, and everything in it is left-aligned. Both matter on a stage
 * the viewer is watching: a panel sized to its contents would resize between a
 * wordy card and a vanilla one, shifting the artwork sideways on every step.
 *
 * @returns The name, code, stats and text beside the card.
 */
function PresentationTextPanel({ printing }: { printing: CardViewerItem["printing"] }) {
  return (
    <div className="flex w-[32rem] max-w-[40vw] shrink-0 flex-col gap-4 self-center">
      <h1 className="text-3xl font-semibold text-balance">{legendDisplayName(printing.card)}</h1>
      <div className="font-mono text-sm tracking-wider text-white/50 uppercase">
        {formatPublicCode(printing)}
      </div>
      <CardDetailStats printing={printing} align="start" />
      <CardDetailText printing={printing} />
    </div>
  );
}

/**
 * The chrome-free card display: one card filling the frame on a near-black
 * ground, with the rules panel and thumbnail strip as keyboard-toggled layers
 * over it.
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
}: {
  items: CardViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
  /** Context line in the corner marker, e.g. the deck's name. */
  title?: string;
}) {
  const idle = useIdle(IDLE_DELAY_MS);
  const { zoneLabels } = useZoneOrder();
  const showText = usePresentationStore((state) => state.showText);
  const showStrip = usePresentationStore((state) => state.showStrip);
  const showHelp = usePresentationStore((state) => state.showHelp);
  const cardScale = usePresentationStore((state) => state.cardScale);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Which way the queue last moved, so the incoming card flies in from the side
  // it came from. Adjusted during render (React's documented pattern for state
  // derived from a changed prop) rather than in an effect, so the animation
  // class is right on the first paint of the new card.
  const [seenIndex, setSeenIndex] = useState(index);
  const [forwards, setForwards] = useState(true);
  if (seenIndex !== index) {
    setForwards(index > seenIndex);
    setSeenIndex(index);
  }

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
  }, [index, items.length, onExit, onIndexChange]);

  if (!current) {
    return null;
  }

  const zoneLabel = current.zone ? zoneLabels[current.zone] : null;
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
        <StageSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
      </div>

      <div className={cn(chrome, "top-4 right-4 text-right")}>
        {title && <div className="text-sm text-white/50">{title}</div>}
        <div className="font-mono text-sm tracking-widest text-white/70 uppercase tabular-nums">
          {zoneLabel ? `${zoneLabel} · ` : ""}
          {index + 1} / {items.length}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-[4vw] p-[4vh]">
        <div
          className="aspect-card relative max-w-full shrink"
          style={{ height: `${cardScale * 100}%` }}
        >
          {/* Keyed on the queue position so every step remounts the layer and
              replays the entry animation, sliding in from the side the queue
              moved towards. */}
          <div
            key={current.id}
            className={cn(
              "animate-in fade-in absolute inset-0 duration-300 ease-out",
              forwards ? "slide-in-from-right-16" : "slide-in-from-left-16",
            )}
          >
            <CardDetailArt printing={current.printing} showImages disableTilt />
          </div>
        </div>

        {showText && <PresentationTextPanel printing={current.printing} />}
      </div>

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

      {showHelp && <PresentationHelpSheet />}
    </div>
  );
}
