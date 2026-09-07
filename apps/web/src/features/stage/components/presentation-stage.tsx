import type { OverlayBoardDirection, OverlayPlateFields } from "@openrift/shared/contracts/overlay";
import type { StageGround, StagePreset } from "@openrift/shared/contracts/stage-presets";
import type { TierRow } from "@openrift/shared/types/api/tier-list";
import { BookmarkPlusIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

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
import { MAX_CARD_SCALE, MIN_CARD_SCALE } from "@/features/cards/lib/card-scale";
import { PresentationFilmstrip } from "@/features/stage/components/presentation-filmstrip";
import { MAX_PRESET_NAME_LENGTH } from "@/features/stage/components/stage-preset-name-dialog";
import { StageShell, StageTileSizeSlider } from "@/features/stage/components/stage-shell";
import {
  useOverlayChannel,
  usePushOverlayCard,
  useSetOverlayHidden,
} from "@/features/stage/hooks/use-overlay";
import { useOverlayBoardSync } from "@/features/stage/hooks/use-overlay-board-sync";
import { useCreateStagePreset, useStagePresets } from "@/features/stage/hooks/use-stage-presets";
import {
  BOARD_ACTIONS,
  ownsSpaceKey,
  resolvePresentationKey,
  WALK_ACTIONS,
} from "@/features/stage/lib/presentation-keys";
import type { PresentationItem } from "@/features/stage/lib/presentation-queue";
import { stepIndex } from "@/features/stage/lib/presentation-queue";
import { captureStagePreset } from "@/features/stage/lib/stage-preset-apply";
import { usePresentationStore } from "@/features/stage/stores/presentation-store";
import { applyStagePresetConfig } from "@/features/stage/stores/stage-preset-actions";
import { useUserId } from "@/lib/auth-session";
import { isTypingTarget } from "@/lib/keyboard-target";
import { useDisplayStore } from "@/stores/display-store";

interface KeyHelpRow {
  keys: string[];
  what: string;
}

const WALK_KEY_HELP: KeyHelpRow[] = [
  { keys: ["←", "→"], what: "Step through the queue" },
  { keys: ["Space"], what: "Next card" },
  { keys: ["Home", "End"], what: "First / last card" },
  { keys: ["T"], what: "Text panel" },
  { keys: ["F"], what: "Thumbnail strip" },
];

const BOARD_KEY_HELP: KeyHelpRow[] = [
  { keys: ["B"], what: "Whole board / one card" },
  { keys: ["C"], what: "Current card beside the board" },
  { keys: ["K"], what: "The current card's tier, large" },
  { keys: ["R"], what: "Fill the board as you go" },
  { keys: ["D"], what: "Start from the bottom tier" },
];

const PUSH_KEY_HELP: KeyHelpRow[] = [{ keys: ["P"], what: "Push this card to the OBS overlay" }];

const OBS_BOARD_KEY_HELP: KeyHelpRow[] = [
  { keys: ["O"], what: "Show this board on the OBS overlay" },
];

const HIDE_KEY_HELP: KeyHelpRow[] = [{ keys: ["H"], what: "Hide / show the OBS overlay" }];

const COMMON_KEY_HELP: KeyHelpRow[] = [
  { keys: ["?"], what: "This help" },
  { keys: ["Esc"], what: "Leave the stage" },
];

function PresentationHelpSheet({
  boardControls,
  pushControls,
  obsControls,
  editControls,
  editing,
}: {
  boardControls: boolean;
  pushControls: boolean;
  obsControls: boolean;
  editControls: boolean;
  editing: boolean;
}) {
  const rows: KeyHelpRow[] = [
    ...(editing ? [] : WALK_KEY_HELP),
    ...(boardControls && !editing ? BOARD_KEY_HELP : []),
    ...(pushControls && !editing ? PUSH_KEY_HELP : []),
    ...(obsControls && !editing ? OBS_BOARD_KEY_HELP : []),
    ...(pushControls ? HIDE_KEY_HELP : []),
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

const PLATE_FIELDS: { key: keyof OverlayPlateFields; label: string }[] = [
  { key: "name", label: "Card name" },
  { key: "code", label: "Set code and foil" },
  { key: "stats", label: "Energy, power and might" },
  { key: "rulesText", label: "Rules text" },
  { key: "flavorText", label: "Flavor text" },
];

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

// Presets never auto-apply on load.
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
        // On failure the typed text stays put to be corrected; the global mutation toast covers the error.
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
            // The stage's key handler stands down inside a text field, so Enter is free here.
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

interface StageObsControls {
  enabled: boolean;
  onToggle: () => void;
}

function BoardSettings({ obs }: { obs?: StageObsControls }) {
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

// Editing state lives in the URL, not the presentation store, and stays out of {@link captureStagePreset}.
export interface StageEditControls {
  editing: boolean;
  onToggle: () => void;
  status?: ReactNode;
}

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
          // A reveal always shows the hero, regardless of this switch.
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

// Mounted only while signed in: the push mutation needs a session, and the stage runs signed out.
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

// Reads `hidden` from the channel query, not local state.
function StageOverlayHideKey() {
  const { data: channel } = useOverlayChannel();
  const setHidden = useSetOverlayHidden();
  const mutate = setHidden.mutate;
  const hidden = channel?.payload.hidden;

  useEffect(() => {
    if (hidden === undefined) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (resolvePresentationKey(event) !== "toggleHidden") {
        return;
      }
      event.preventDefault();
      mutate({ hidden: !hidden });
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mutate, hidden]);

  return null;
}

export interface StageObsBoard {
  title: string;
  tiers: readonly TierRow[];
  direction: OverlayBoardDirection;
  revealCount: number;
}

// Split out for the same reason as StageOverlayPushKey: the channel mutation needs a session.
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
  exitLabel?: string;
  title?: string;
  boardControls?: boolean;
  obsBoard?: StageObsBoard;
  edit?: StageEditControls;
  children: ReactNode;
}) {
  const showStrip = usePresentationStore((state) => state.showStrip);
  const showHelp = usePresentationStore((state) => state.showHelp);
  const userId = useUserId();
  // Deliberately not in the presentation store: a restored "mirroring" flag would put
  // a board from a previous session on stream the moment this one opened.
  const [obsBoardOn, setObsBoardOn] = useState(false);

  const editing = edit?.editing === true;
  const current = items[index];
  const obsAvailable = obsBoard !== undefined && userId !== null;

  const handleEscape = () => {
    const store = usePresentationStore.getState();
    if (store.showHelp) {
      store.closeHelp();
      return;
    }
    onExit();
  };

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
        // Escape belongs to the shell.
        return;
      }
      if (!boardControls && BOARD_ACTIONS.has(action)) {
        return;
      }
      // Handed back so arrows still scroll an oversized board while editing.
      if (editing && WALK_ACTIONS.has(action)) {
        return;
      }
      // Handled by StageOverlayPushKey / StageOverlayHideKey, mounted only while signed in;
      // swallowing here would make the keys dead even when signed in.
      if (action === "push" || action === "toggleHidden") {
        return;
      }
      if (action === "toggleObs") {
        if (!obsAvailable) {
          return;
        }
        event.preventDefault();
        setObsBoardOn((on) => !on);
        return;
      }
      if (action === "toggleEdit") {
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

  const empty = !current && !editing;

  // The queue position only means something on a walk; editing shows the save state instead.
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
      {userId !== null && current && !editing && (
        <StageOverlayPushKey printingId={current.printing.id} />
      )}
      {userId !== null && <StageOverlayHideKey />}
      {/* Always mounted when a board exists; enabled/paused control the sync, so editing
          pauses the mirror without dropping what's already on stream. */}
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
            {edit ? "Nothing on the board yet. Press E to start ranking." : "Nothing to show here."}
          </div>
        ) : (
          children
        )}
      </StageShell>
    </>
  );
}
