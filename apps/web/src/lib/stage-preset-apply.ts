import type {
  OverlayPayload,
  OverlayPlateFields,
  OverlaySettings,
  StageGround,
  StagePresetConfig,
} from "@openrift/shared";

import { useDisplayStore } from "@/stores/display-store";
import { clampCardScale, usePresentationStore } from "@/stores/presentation-store";

/**
 * What the presentation stage takes from a preset, plus the one display
 * preference that belongs to the board rather than the stage.
 *
 * Split in two because the two halves land in two different stores: `stage`
 * goes to the presentation store, `tierTileStep` to the display store. Both are
 * absent when the preset says nothing about them — an applied preset only ever
 * moves the switches it was saved with.
 */
export interface StagePresetPatch {
  stage: {
    cardScale?: number;
    showText?: boolean;
    ground?: StageGround;
    plateFields?: OverlayPlateFields;
  };
  tierTileStep?: number;
}

/** The presentation-store fields a preset reads from and writes back to. */
export interface CapturedStageState {
  cardScale: number;
  showText: boolean;
  ground: StageGround;
  plateFields: OverlayPlateFields;
}

/**
 * Turns a preset into the switches the presentation stage should move.
 *
 * `plateFields` merges over what the stage already has rather than replacing
 * it: a preset saved to turn the flavour line on carries that one key, and
 * replacing the object would read as "and switch the other four off".
 *
 * The scale is clamped on the way in. The API validates its range, but a
 * preset written before the range moved (or by a client that got it wrong) must
 * not be able to shrink the card to nothing on stage.
 *
 * @returns The presentation-store patch and the board's tile size.
 */
export function presetToStagePatch(
  config: StagePresetConfig,
  currentPlateFields: OverlayPlateFields,
): StagePresetPatch {
  const stage: StagePresetPatch["stage"] = {};
  if (config.cardScale !== undefined) {
    stage.cardScale = clampCardScale(config.cardScale);
  }
  if (config.showText !== undefined) {
    stage.showText = config.showText;
  }
  if (config.ground !== undefined) {
    stage.ground = config.ground;
  }
  if (config.plateFields !== undefined) {
    stage.plateFields = { ...currentPlateFields, ...config.plateFields };
  }

  const patch: StagePresetPatch = { stage };
  if (config.tierTileStep !== undefined) {
    patch.tierTileStep = config.tierTileStep;
  }
  return patch;
}

/**
 * Puts a preset on the stage: the one impure function here, and the single
 * place both callers (the settings popover's picker and `/stage?preset=`)
 * write through, so recall behaves the same whichever asked for it.
 *
 * The plate fields are read at call time rather than passed in, because a
 * preset merges over whatever the stage is dressed as *now*.
 */
export function applyStagePresetConfig(config: StagePresetConfig): void {
  const patch = presetToStagePatch(config, usePresentationStore.getState().plateFields);
  usePresentationStore.setState(patch.stage);
  if (patch.tierTileStep !== undefined) {
    useDisplayStore.getState().setTierTileStep(patch.tierTileStep);
  }
}

/**
 * Turns a preset into the stream overlay's settings update.
 *
 * Only the fields the preset actually sets, because the settings call treats an
 * absent key as "leave it alone". `qrUrl` is the one field where null is a
 * value of its own (hide the code), so it is included whenever it is not
 * `undefined`.
 *
 * The presentation-only fields (`cardScale`, `showText`, `ground`,
 * `tierTileStep`) are dropped — one preset dresses both surfaces, and each
 * surface takes the half it can render.
 *
 * @returns The settings patch for the overlay's update mutation.
 */
export function presetToOverlaySettings(config: StagePresetConfig): OverlaySettings {
  const settings: OverlaySettings = {};
  if (config.showPlate !== undefined) {
    settings.showPlate = config.showPlate;
  }
  if (config.platePosition !== undefined) {
    settings.platePosition = config.platePosition;
  }
  if (config.plateFields !== undefined) {
    settings.plateFields = config.plateFields;
  }
  if (config.qrUrl !== undefined) {
    settings.qrUrl = config.qrUrl;
  }
  if (config.corner !== undefined) {
    settings.corner = config.corner;
  }
  if (config.scale !== undefined) {
    settings.scale = config.scale;
  }
  return settings;
}

/**
 * What "Save current as preset" writes from the presentation stage.
 *
 * Every stage field is set, unlike a preset assembled by hand: the creator is
 * saving the scene in front of them, and a field left out would come back as
 * whatever the stage happened to have at recall time.
 *
 * @returns The preset config for the stage's current dressing.
 */
export function captureStagePreset(
  state: CapturedStageState,
  tierTileStep: number,
): StagePresetConfig {
  return {
    cardScale: state.cardScale,
    showText: state.showText,
    ground: state.ground,
    plateFields: { ...state.plateFields },
    tierTileStep,
  };
}

/**
 * What "Save current as preset" writes from the Stage's OBS output: the scene as
 * the browser source is painting it right now, minus the card itself.
 *
 * @returns The preset config for the channel's current dressing.
 */
export function captureOverlayPreset(payload: OverlayPayload): StagePresetConfig {
  return {
    showPlate: payload.showPlate,
    platePosition: payload.platePosition,
    plateFields: { ...payload.plateFields },
    qrUrl: payload.qrUrl,
    corner: payload.corner,
    scale: payload.scale,
  };
}
