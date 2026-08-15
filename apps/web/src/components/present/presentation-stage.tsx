import type {
  OverlayBoardDirection,
  OverlayPlateFields,
  StageGround,
  StagePreset,
  TierRow,
} from "@openrift/shared";
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
import { useOverlayBoardSync } from "@/hooks/use-overlay-board-sync";
import { useCreateStagePreset, useStagePresets } from "@/hooks/use-stage-presets";
import { useUserId } from "@/lib/auth-session";
import {
  BOARD_ACTIONS,
  isTypingTarget,
  ownsSpaceKey,
  resolvePresentationKey,
  WALK_ACTIONS,
} from "@/lib/presentation-keys";
import type { PresentationItem } from "@/lib/presentation-queue";
import { stepIndex } from "@/lib/presentation-queue";
import { applyStagePresetConfig, captureStagePreset } from "@/lib/stage-preset-apply";
import { useDisplayStore } from "@/stores/display-store";
import { MAX_CARD_SCALE, MIN_CARD_SCALE, usePresentationStore } from "@/stores/presentation-store";

interface KeyHelpRow {
  keys: string[];
  what: string;
}

/** The running order's own keys. Nothing here applies while the board is being edited. */
const WALK_KEY_HELP: KeyHelpRow[] = [
  { keys: ["←", "→"], what: "Step through the queue" },
  { keys: ["Space"], what: "Next card" },
  { keys: ["Home", "End"], what: "First / last card" },
  { keys: ["T"], what: "Text panel" },
  { keys: ["F"], what: "Thumbnail strip" },
];

/** Extra rows shown only when the run has a board behind it. */
const BOARD_KEY_HELP: KeyHelpRow[] = [
  { keys: ["B"], what: "Whole board / one card" },
  { keys: ["C"], what: "Current card beside the board" },
  { keys: ["K"], what: "The current card's tier, large" },
  { keys: ["R"], what: "Fill the board as you go" },
  { keys: ["D"], what: "Start from the bottom tier" },
];

/** Shown only while signed in, since the push needs a channel to push to. */
const PUSH_KEY_HELP: KeyHelpRow[] = [{ keys: ["P"], what: "Push this card to the OBS overlay" }];

/** Shown only while signed in on a run that has a board to mirror. */
const OBS_BOARD_KEY_HELP: KeyHelpRow[] = [
  { keys: ["O"], what: "Show this board on the OBS overlay" },
];

/** The two rows every stage carries, whichever mode it is in. Always last. */
const COMMON_KEY_HELP: KeyHelpRow[] = [
  { keys: ["?"], what: "This help" },
  { keys: ["Esc"], what: "Leave the stage" },
];

/**
 * The keyboard cheat sheet, toggled with `?`.
 *
 * Editing collapses it to almost nothing on purpose: the walk's keys are not
 * merely hidden but genuinely inactive there (see `WALK_ACTIONS`), and a help
 * sheet that lists keys which do nothing is worse than no help sheet.
 *
 * @returns The help sheet overlay.
 */
function PresentationHelpSheet({
  boardControls,
  pushControls,
  obsControls,
  editControls,
  editing,
}: {
  boardControls: boolean;
  pushControls: boolean;
  /** Whether this run can mirror its board onto the overlay, i.e. whether `O` does anything. */
  obsControls: boolean;
  /** Whether this source can be edited at all, i.e. whether `E` does anything. */
  editControls: boolean;
  editing: boolean;
}) {
  const rows: KeyHelpRow[] = [
    ...(editing ? [] : WALK_KEY_HELP),
    ...(boardControls && !editing ? BOARD_KEY_HELP : []),
    ...(pushControls && !editing ? PUSH_KEY_HELP : []),
    ...(obsControls && !editing ? OBS_BOARD_KEY_HELP : []),
    ...(editControls
      ? [{ keys: ["E"], what: editing ? "Back to the show" : "Edit the board" }]
      : []),
    ...COMMON_KEY_HELP,
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
 * The mirror switch, offered only where there is both a board to mirror and a
 * channel to mirror it onto — so a signed-out creator, or a deck walk, never
 * sees a row for something that cannot happen.
 */
interface StageObsControls {
  /** True while the board on stage is also on the overlay. */
  enabled: boolean;
  onToggle: () => void;
}

/**
 * The board layout's own settings: which shape the run takes, and how large the
 * tiles on the ladder read. Split out so the card-only sources never render a
 * row for a control that would do nothing.
 *
 * @returns The board rows for the settings popover.
 */
function BoardSettings({ obs }: { obs?: StageObsControls }) {
  // Read out of the object so the row below hands a plain local to `onToggle`
  // rather than a member of a prop.
  const handleObsToggle = obs?.onToggle;
  const boardMode = usePresentationStore((state) => state.boardMode);
  const showRank = usePresentationStore((state) => state.showRank);
  const reveal = usePresentationStore((state) => state.reveal);
  const direction = usePresentationStore((state) => state.direction);
  const toggleBoard = usePresentationStore((state) => state.toggleBoard);
  const toggleRank = usePresentationStore((state) => state.toggleRank);
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
        id="stage-show-rank"
        label="Tier badge"
        hotkey="K"
        checked={showRank}
        onToggle={toggleRank}
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
      {/* Last, because it is the one row here about a second screen rather than
          this one: everything above dresses the stage, this sends what the
          stage is showing to the browser source as well. */}
      {handleObsToggle && (
        <StageToggleRow
          id="stage-obs-board"
          label="Board on OBS"
          hotkey="O"
          checked={obs?.enabled === true}
          onToggle={handleObsToggle}
        />
      )}
    </>
  );
}

/**
 * Turning the board from something being shown into something being changed.
 *
 * Offered by sources that own their board and can save it back — today the
 * signed-in creator's own tier list, which is why a shared list gets no switch.
 * The state itself lives in the URL rather than in the presentation store, so a
 * link can open straight into the editor and a reload stays there. That also
 * keeps it out of {@link captureStagePreset}: a saved preset dresses a stage, it
 * does not decide whether the stage is writable.
 */
export interface StageEditControls {
  /** True while the board is being edited rather than presented. */
  editing: boolean;
  /** Flips between the two. */
  onToggle: () => void;
  /**
   * Save state, shown in the corner marker where the queue position sits during
   * a show. The editor has no Save button, so this is the only thing on stage
   * telling a creator their ranking made it to the server.
   */
  status?: ReactNode;
}

/**
 * The stage's settings: the card itself first — whether it is up, and how large
 * — then the layers that otherwise only answer to a key. A creator who never
 * reads the help sheet can still find the rules panel and the thumbnail strip.
 *
 * The card rows lead because the card is what the size slider sizes, and a
 * slider above the switch that decides whether there is anything to size read
 * as a control that did nothing.
 *
 * Editing strips it back to the handful that still apply. There is no card of
 * the moment to frame and no running order to dress, so every row about one is
 * left out rather than rendered as a switch that moves nothing. What survives is
 * what the editor is still sat on: the board's tile size, the ground, and the
 * presets that set both.
 *
 * @returns The rows for the shell's settings popover.
 */
function StageSettings({
  boardControls,
  obs,
  edit,
}: {
  boardControls: boolean;
  obs?: StageObsControls;
  edit?: StageEditControls;
}) {
  const showText = usePresentationStore((state) => state.showText);
  const showStrip = usePresentationStore((state) => state.showStrip);
  const showHelp = usePresentationStore((state) => state.showHelp);
  const cardScale = usePresentationStore((state) => state.cardScale);
  const boardMode = usePresentationStore((state) => state.boardMode);
  const showHero = usePresentationStore((state) => state.showHero);
  const reveal = usePresentationStore((state) => state.reveal);
  const toggleText = usePresentationStore((state) => state.toggleText);
  const toggleStrip = usePresentationStore((state) => state.toggleStrip);
  const toggleHelp = usePresentationStore((state) => state.toggleHelp);
  const toggleHero = usePresentationStore((state) => state.toggleHero);
  const setCardScale = usePresentationStore((state) => state.setCardScale);

  const handleScale = (value: number | readonly number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (typeof next === "number") {
      setCardScale(next / 100);
    }
  };

  const handleEditToggle = edit?.onToggle;
  const editing = edit?.editing === true;

  // Leads the popover: while editing it is the way back to the show, which is
  // the row a creator opening this panel mid-recording is most likely after.
  const editRow = handleEditToggle && (
    <StageToggleRow
      id="stage-edit"
      label="Edit the board"
      hotkey="E"
      checked={editing}
      onToggle={handleEditToggle}
    />
  );

  if (editing) {
    return (
      <>
        {editRow}
        <StageTileSizeSlider />
        <StageToggleRow
          id="stage-show-help"
          label="Key list"
          hotkey="?"
          checked={showHelp}
          onToggle={toggleHelp}
        />
        <GroundSettings />
        <StagePresetSettings />
      </>
    );
  }

  // The hero switch only bites in the board layout — the card layout *is* the
  // card, and hiding it there would leave an empty stage. So the row is offered
  // where it does something, and the size slider follows whether a card is
  // actually up to be sized.
  const heroSwitchApplies = boardControls && boardMode;
  const cardOnStage = !heroSwitchApplies || showHero || reveal;

  return (
    <>
      {editRow}
      {heroSwitchApplies && (
        <StageToggleRow
          id="stage-show-hero"
          label="Current card"
          hotkey="C"
          // A reveal is the card waiting to be placed, so it holds the card up
          // whatever this says — showing it off would be a lie about the stage.
          checked={showHero || reveal}
          onToggle={toggleHero}
        />
      )}
      {cardOnStage && (
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
      )}
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
      {boardControls && <BoardSettings obs={obs} />}
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
 * The board the stage is showing, as the OBS overlay would draw it.
 *
 * The rows are the list's saved ones rather than the resolved ones — the overlay
 * resolves them against its own catalogue, exactly as the board on stage does —
 * and `revealCount` is the stage's own position translated into how much of the
 * ladder is up. Supplied by a source that has a board; everything else omits it
 * and gets no mirror switch.
 */
export interface StageObsBoard {
  title: string;
  tiers: readonly TierRow[];
  direction: OverlayBoardDirection;
  revealCount: number;
}

/**
 * Keeps the overlay's board in step with the stage's, for as long as the switch
 * is on.
 *
 * A component of its own for the same reason {@link StageOverlayPushKey} is:
 * the channel mutations need a session, and the stage runs signed out.
 *
 * @returns Nothing — it only runs the sync.
 */
function StageObsBoardSync({
  board,
  enabled,
  paused,
}: {
  board: StageObsBoard;
  enabled: boolean;
  paused: boolean;
}) {
  useOverlayBoardSync({ enabled, paused, ...board });
  return null;
}

/**
 * A show that walks a queue: the {@link StageShell}'s frame, plus everything
 * that belongs to having a running order — the keyboard, the position marker,
 * the thumbnail strip and the key list. What actually fills the middle arrives
 * as `children` — one big card for a deck walk or an ad-hoc queue, a tier board
 * for a ranking.
 *
 * A source that can be edited (`edit`) puts its editor in `children` too, and
 * the stage stands its running order down around it: the walk's keys go back to
 * the browser, the filmstrip and the position marker come off, and the settings
 * shrink to what an editor still sits on. The two modes live in one component
 * rather than two stages because that is where their mutual exclusions can be
 * seen at once — a walk key that stays live over an editor is the bug this shape
 * is built to prevent.
 *
 * @returns The presentation stage.
 */
export function PresentationStage({
  items,
  index,
  onIndexChange,
  onExit,
  exitLabel,
  title,
  boardControls = false,
  obsBoard,
  edit,
  children,
}: {
  items: PresentationItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
  /** What the corner's exit button says it goes back to. */
  exitLabel?: string;
  /** Context line in the corner marker, e.g. the deck's or the list's name. */
  title?: string;
  /** Offers the board layout's keys and settings. Only a ranking has a board. */
  boardControls?: boolean;
  /** The board as the OBS overlay would draw it. Offers the mirror switch and `O`. */
  obsBoard?: StageObsBoard;
  /** Offers the editor. Only a source that owns its board and can save it back. */
  edit?: StageEditControls;
  children: ReactNode;
}) {
  const showStrip = usePresentationStore((state) => state.showStrip);
  const showHelp = usePresentationStore((state) => state.showHelp);
  const userId = useUserId();
  // Deliberately not in the presentation store, persisted or otherwise: a
  // "mirroring" flag restored from a previous session would put a board from
  // last week's recording on stream the moment this one opened.
  const [obsBoardOn, setObsBoardOn] = useState(false);

  const editing = edit?.editing === true;
  const current = items[index];
  const obsAvailable = obsBoard !== undefined && userId !== null;

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

  // Read out of the object before the effect so the switch below calls a plain
  // local rather than an optional member, and so the dependency is the function
  // itself instead of the controls object.
  const toggleEdit = edit?.onToggle;

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
      // Editing has no running order and no card of the moment. Handing these
      // back rather than swallowing them is what lets the arrows scroll a board
      // taller than the stage while it is being ranked.
      if (editing && WALK_ACTIONS.has(action)) {
        return;
      }
      // The OBS push belongs to StageOverlayPushKey, which is only mounted
      // while signed in. Swallowing it here would make the key dead for
      // everyone, signed in included.
      if (action === "push") {
        return;
      }
      if (action === "toggleObs") {
        // Nothing to mirror, or nowhere to mirror it to: the key keeps whatever
        // the browser does with it rather than being swallowed for nothing.
        if (!obsAvailable) {
          return;
        }
        event.preventDefault();
        setObsBoardOn((on) => !on);
        return;
      }
      if (action === "toggleEdit") {
        // Left alone on a source with nothing to edit — a shared list, a deck
        // walk — so `E` keeps whatever the browser does with it.
        if (toggleEdit === undefined) {
          return;
        }
        event.preventDefault();
        toggleEdit();
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
        case "toggleRank": {
          store.toggleRank();
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
  }, [boardControls, editing, index, items.length, obsAvailable, onIndexChange, toggleEdit]);

  // A walk needs a card; the editor does not, because a board with nothing on it
  // yet is exactly what a creator opens the editor to fix.
  const empty = !current && !editing;

  // The position marker only means something on a walk, so editing puts the save
  // state there instead — the editor writes as it goes, and this is the only
  // thing on stage that says the ranking made it to the server.
  let marker: ReactNode;
  if (editing) {
    marker = edit?.status;
  } else if (!empty) {
    marker = (
      <>
        {current?.contextLabel ? `${current.contextLabel} · ` : ""}
        {index + 1} / {items.length}
      </>
    );
  }

  return (
    <>
      {/* Pushing the card of the moment needs one. The editor has no such card,
          and its board is not what the overlay draws. */}
      {userId !== null && current && !editing && (
        <StageOverlayPushKey printingId={current.printing.id} />
      )}
      {/* Mounted whether or not the switch is on, so flipping it is what starts
          and stops the mirror rather than a component appearing. Editing pauses
          it rather than taking it down: the board on stream stays as it was
          pushed while the ranking behind it is being changed. */}
      {obsBoard !== undefined && userId !== null && (
        <StageObsBoardSync board={obsBoard} enabled={obsBoardOn} paused={editing} />
      )}
      <StageShell
        onExit={onExit}
        exitLabel={exitLabel}
        onEscape={handleEscape}
        settings={
          <StageSettings
            boardControls={boardControls}
            obs={
              obsAvailable
                ? { enabled: obsBoardOn, onToggle: () => setObsBoardOn(!obsBoardOn) }
                : undefined
            }
            edit={edit}
          />
        }
        title={
          <>
            {title && <div className="text-sm text-white/50">{title}</div>}
            {marker !== undefined && (
              <div className="font-mono text-sm tracking-widest text-white/70 uppercase tabular-nums">
                {marker}
              </div>
            )}
          </>
        }
        footer={
          showStrip && !editing && !empty ? (
            <PresentationFilmstrip items={items} index={index} onSelect={onIndexChange} />
          ) : null
        }
        hint="Press ? for keys"
        overlay={
          showHelp ? (
            <PresentationHelpSheet
              boardControls={boardControls}
              pushControls={userId !== null}
              obsControls={obsAvailable}
              editControls={edit !== undefined}
              editing={editing}
            />
          ) : null
        }
      >
        {empty ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-white/50">
            {/* Landing here is deliberate on an editable source — it is what
                opening a fresh list on stage looks like — so it says what to do
                next rather than leaving a black rectangle on the capture. */}
            {edit ? "Nothing on the board yet. Press E to start ranking." : "Nothing to show here."}
          </div>
        ) : (
          children
        )}
      </StageShell>
    </>
  );
}
