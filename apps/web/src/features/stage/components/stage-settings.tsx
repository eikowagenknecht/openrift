import type { OverlayPlateFields } from "@openrift/shared/contracts/overlay";
import type { StageGround } from "@openrift/shared/contracts/stage-presets";
import type { ReactNode } from "react";

import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MAX_CARD_SCALE, MIN_CARD_SCALE } from "@/features/cards/lib/card-scale";
import { StagePresetSettings } from "@/features/stage/components/stage-preset-settings";
import { StageTileSizeSlider } from "@/features/stage/components/stage-shell";
import { usePresentationStore } from "@/features/stage/stores/presentation-store";

export function StageToggleRow({
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

export function PlateFieldSettings() {
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

export function GroundSettings() {
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

export interface StageObsControls {
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

export function StageSettings({
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
