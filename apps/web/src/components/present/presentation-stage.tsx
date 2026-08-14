import type { OverlayPlateFields, StageGround, StagePreset } from "@openrift/shared";
import { BookmarkPlusIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { PresentationFilmstrip } from "@/components/present/presentation-filmstrip";
import { MAX_PRESET_NAME_LENGTH } from "@/components/present/stage-preset-name-dialog";
import { StageShell, StageTileSizeSlider } from "@/components/present/stage-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePushOverlayCard } from "@/hooks/use-overlay";
import { useCreateStagePreset, useStagePresets } from "@/hooks/use-stage-presets";
import { useUserId } from "@/lib/auth-session";
import {
  BOARD_ACTIONS,
  isTypingTarget,
  ownsSpaceKey,
  resolvePresentationKey,
} from "@/lib/presentation-keys";
import type { PresentationItem } from "@/lib/presentation-queue";
import { stepIndex } from "@/lib/presentation-queue";
import { applyStagePresetConfig, captureStagePreset } from "@/lib/stage-preset-apply";
import { useDisplayStore } from "@/stores/display-store";
import { MAX_CARD_SCALE, MIN_CARD_SCALE, usePresentationStore } from "@/stores/presentation-store";

const KEY_HELP: { keys: string[]; what: string }[] = [
  { keys: ["←", "→"], what: "Step through the queue" },
  { keys: ["Space"], what: "Next card" },
  { keys: ["Home", "End"], what: "First / last card" },
  { keys: ["T"], what: "Text panel" },
  { keys: ["F"], what: "Thumbnail strip" },
  { keys: ["?"], what: "This help" },
  { keys: ["Esc"], what: "Leave the show" },
];

/** Extra rows shown only when the run has a board behind it. */
const BOARD_KEY_HELP: { keys: string[]; what: string }[] = [
  { keys: ["B"], what: "Whole board / one card" },
  { keys: ["C"], what: "Current card beside the board" },
  { keys: ["R"], what: "Fill the board as you go" },
  { keys: ["D"], what: "Start from the bottom tier" },
];

/** Shown only while signed in, since the push needs a channel to push to. */
const PUSH_KEY_HELP: { keys: string[]; what: string }[] = [
  { keys: ["P"], what: "Push this card to the OBS overlay" },
];

/**
 * The keyboard cheat sheet, toggled with `?`.
 * @returns The help sheet overlay.
 */
function PresentationHelpSheet({
  boardControls,
  pushControls,
}: {
  boardControls: boolean;
  pushControls: boolean;
}) {
  const rows = [
    ...KEY_HELP,
    ...(boardControls ? BOARD_KEY_HELP : []),
    ...(pushControls ? PUSH_KEY_HELP : []),
  ];
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
 * thing shown beside it. Rows with no key of their own (the text panel's
 * per-line switches) leave the `hotkey` off.
 *
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
  hotkey?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="flex-1">
        {label}
      </Label>
      {hotkey && <Kbd>{hotkey}</Kbd>}
      <Switch id={id} checked={checked} onCheckedChange={onToggle} />
    </div>
  );
}

/** The text panel's lines, worded as the stream overlay's settings word them. */
const PLATE_FIELDS: { key: keyof OverlayPlateFields; label: string }[] = [
  { key: "name", label: "Card name" },
  { key: "code", label: "Set code and foil" },
  { key: "stats", label: "Energy, power and might" },
  { key: "rulesText", label: "Rules text" },
  { key: "flavorText", label: "Flavor text" },
];

/**
 * Which lines the text panel carries, shown only while the panel is on. Indented
 * under the row that opens it, so it reads as trimming that panel rather than as
 * five more stage layers.
 *
 * @returns The per-line switches for the settings popover.
 */
function PlateFieldSettings() {
  const plateFields = usePresentationStore((state) => state.plateFields);
  const togglePlateField = usePresentationStore((state) => state.togglePlateField);

  return (
    <div className="border-border ml-1 flex flex-col gap-2 border-l pl-3">
      {PLATE_FIELDS.map((field) => (
        <StageToggleRow
          key={field.key}
          id={`stage-plate-${field.key}`}
          label={field.label}
          checked={plateFields[field.key]}
          onToggle={() => togglePlateField(field.key)}
        />
      ))}
    </div>
  );
}

const GROUNDS: { value: StageGround; label: string }[] = [
  { value: "black", label: "Black" },
  { value: "green", label: "Green" },
  { value: "magenta", label: "Magenta" },
];

function isGround(value: unknown): value is StageGround {
  return GROUNDS.some((option) => option.value === value);
}

/**
 * What the stage sits on. Offered on every kind of show, not just the ones with
 * a board: keying the card out of a black rectangle is the point of the setting,
 * and a deck walk wants it as much as a ranking does.
 *
 * @returns The ground picker for the settings popover.
 */
function GroundSettings() {
  const ground = usePresentationStore((state) => state.ground);
  const setGround = usePresentationStore((state) => state.setGround);

  return (
    <div className="flex flex-col gap-2">
      <Label>Ground</Label>
      <ToggleGroup
        aria-label="Ground"
        variant="outline"
        value={[ground]}
        onValueChange={([next]) => {
          if (isGround(next)) {
            setGround(next);
          }
        }}
        className="grid w-full grid-cols-3"
      >
        {GROUNDS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/**
 * Saved dressing: apply one, or keep the current setup as a new one.
 *
 * Recall is always a deliberate pick — nothing here restores itself, because a
 * scene from a previous recording silently reappearing on stage is exactly the
 * surprise presentation mode's unpersisted store exists to avoid.
 *
 * Signed out there is nothing to show, so the block is left out rather than
 * rendered empty: presets live on the account.
 *
 * Naming a new preset happens inline rather than in a dialog. A modal opened
 * from inside this popover would have to survive the popover dismissing itself
 * under it, and a stage that is being recorded is the last place to throw a
 * modal over. The OBS output panel, which has no popover to fight, uses the
 * shared dialog instead.
 *
 * @returns The presets block, or null while signed out.
 */
function StagePresetSettings() {
  const userId = useUserId();
  const { data: presets } = useStagePresets();
  const createPreset = useCreateStagePreset();
  const tierTileStep = useDisplayStore((state) => state.tierTileStep);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (userId === null) {
    return null;
  }

  const items = (presets ?? []).map((preset: StagePreset) => ({
    value: preset.id,
    label: preset.name,
  }));

  const apply = (id: string) => {
    const preset = presets?.find((candidate) => candidate.id === id);
    if (!preset) {
      return;
    }
    setAppliedId(id);
    applyStagePresetConfig(preset.config);
  };

  const trimmedName = name.trim();

  const save = () => {
    const config = captureStagePreset(usePresentationStore.getState(), tierTileStep);
    createPreset.mutate(
      { name: trimmedName, config },
      {
        // The field is only put away on success, so a duplicate name (or the
        // preset cap) leaves the typed text there to be corrected. The failure
        // itself is the global mutation toast's.
        onSuccess: (preset) => {
          setAppliedId(preset.id);
          setNaming(false);
          setName("");
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="stage-preset">Presets</Label>
      <div className="flex items-center gap-2">
        <Select
          items={items}
          value={appliedId}
          onValueChange={(next) => {
            if (typeof next === "string") {
              apply(next);
            }
          }}
        >
          <SelectTrigger id="stage-preset" className="flex-1" disabled={items.length === 0}>
            <SelectValue placeholder={items.length === 0 ? "None saved yet" : "Apply a preset"} />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          aria-label={naming ? "Cancel saving a preset" : "Save current as preset"}
          title={naming ? "Cancel" : "Save current as preset"}
          onClick={() => {
            setName("");
            setNaming(!naming);
          }}
        >
          {naming ? <XIcon /> : <BookmarkPlusIcon />}
        </Button>
      </div>

      {naming && (
        <div className="flex items-center gap-2">
          <Input
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the button just swapped itself for this field; leaving focus behind would strand a keyboard user on the stage
            autoFocus
            aria-label="Preset name"
            value={name}
            maxLength={MAX_PRESET_NAME_LENGTH}
            placeholder="Green screen, plate off"
            className="flex-1"
            onChange={(event) => setName(event.target.value)}
            // The stage's own key handler stands down inside a text field, so
            // Enter is free to mean "save this one".
            onKeyDown={(event) => {
              if (event.key === "Enter" && trimmedName !== "") {
                save();
              }
            }}
          />
          <Button size="sm" disabled={trimmedName === "" || createPreset.isPending} onClick={save}>
            Save
          </Button>
        </div>
      )}
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
  const showHero = usePresentationStore((state) => state.showHero);
  const reveal = usePresentationStore((state) => state.reveal);
  const direction = usePresentationStore((state) => state.direction);
  const toggleBoard = usePresentationStore((state) => state.toggleBoard);
  const toggleHero = usePresentationStore((state) => state.toggleHero);
  const toggleReveal = usePresentationStore((state) => state.toggleReveal);
  const toggleDirection = usePresentationStore((state) => state.toggleDirection);

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
        id="stage-show-hero"
        label="Current card"
        hotkey="C"
        // A reveal is the card waiting to be placed, so it holds the card up
        // whatever this says — showing it off would be a lie about the stage.
        checked={showHero || reveal}
        onToggle={toggleHero}
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
      {boardMode && <StageTileSizeSlider />}
    </>
  );
}

/**
 * The stage's settings, card size first, then the layers that otherwise only
 * answer to a key. A creator who never reads the help sheet can still find the
 * rules panel and the thumbnail strip.
 *
 * @returns The rows for the shell's settings popover.
 */
function StageSettings({ boardControls }: { boardControls: boolean }) {
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
    <>
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
        label="Text panel"
        hotkey="T"
        checked={showText}
        onToggle={toggleText}
      />
      {showText && <PlateFieldSettings />}
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
      <GroundSettings />
      <StagePresetSettings />
    </>
  );
}

/**
 * `P` puts the card on stage onto the OBS browser source, so the same run can
 * feed a window capture and an overlay without leaving the show.
 *
 * A component of its own, mounted only while signed in: the channel mutation
 * needs a session, and the stage runs signed out. It binds the one key itself
 * rather than reporting the push up to the stage's handler, which would mean
 * threading a mutation through a component that may never have one.
 *
 * @returns Nothing — it only binds the key.
 */
function StageOverlayPushKey({ printingId }: { printingId: string }) {
  const pushCard = usePushOverlayCard();
  const mutate = pushCard.mutate;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (resolvePresentationKey(event) !== "push") {
        return;
      }
      event.preventDefault();
      mutate({ printingId });
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mutate, printingId]);

  return null;
}

/**
 * A show that walks a queue: the {@link StageShell}'s frame, plus everything
 * that belongs to having a running order — the keyboard, the position marker,
 * the thumbnail strip and the key list. What actually fills the middle arrives
 * as `children` — one big card for a deck walk or an ad-hoc queue, a tier board
 * for a ranking.
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
  const showStrip = usePresentationStore((state) => state.showStrip);
  const showHelp = usePresentationStore((state) => state.showHelp);
  const userId = useUserId();

  const current = items[index];

  // Escape closes the help sheet first, so it never takes the creator out of
  // the show when they only wanted the key list gone. The shell owns the key
  // itself; this is what it does once it fires.
  const handleEscape = () => {
    const store = usePresentationStore.getState();
    if (store.showHelp) {
      store.closeHelp();
      return;
    }
    onExit();
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === " " && ownsSpaceKey(event.target)) {
        return;
      }
      const action = resolvePresentationKey(event);
      if (action === null || action === "exit") {
        // Escape belongs to the shell, which is where leaving the stage lives.
        return;
      }
      // A run with no board leaves those keys alone rather than swallowing them
      // to do nothing.
      if (!boardControls && BOARD_ACTIONS.has(action)) {
        return;
      }
      // The OBS push belongs to StageOverlayPushKey, which is only mounted
      // while signed in. Swallowing it here would make the key dead for
      // everyone, signed in included.
      if (action === "push") {
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
        case "toggleHero": {
          store.toggleHero();
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
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [boardControls, index, items.length, onIndexChange]);

  if (!current) {
    return null;
  }

  return (
    <>
      {userId !== null && <StageOverlayPushKey printingId={current.printing.id} />}
      <StageShell
        onExit={onExit}
        onEscape={handleEscape}
        settings={<StageSettings boardControls={boardControls} />}
        title={
          <>
            {title && <div className="text-sm text-white/50">{title}</div>}
            <div className="font-mono text-sm tracking-widest text-white/70 uppercase tabular-nums">
              {current.contextLabel ? `${current.contextLabel} · ` : ""}
              {index + 1} / {items.length}
            </div>
          </>
        }
        footer={
          showStrip ? (
            <PresentationFilmstrip items={items} index={index} onSelect={onIndexChange} />
          ) : null
        }
        hint="Press ? for keys"
        overlay={
          showHelp ? (
            <PresentationHelpSheet boardControls={boardControls} pushControls={userId !== null} />
          ) : null
        }
      >
        {children}
      </StageShell>
    </>
  );
}
