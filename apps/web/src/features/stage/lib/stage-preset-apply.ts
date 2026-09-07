import type {
  OverlayPayload,
  OverlayPlateFields,
  OverlaySettings,
} from "@openrift/shared/contracts/overlay";
import type { StageGround, StagePresetConfig } from "@openrift/shared/contracts/stage-presets";

import { clampCardScale } from "@/features/cards/lib/card-scale";

/**
 * `stage` lands in the presentation store, `tierTileStep` in the display
 * store; both are absent when the preset says nothing about them.
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

export interface CapturedStageState {
  cardScale: number;
  showText: boolean;
  ground: StageGround;
  plateFields: OverlayPlateFields;
}

/** `plateFields` merges over `currentPlateFields`; it does not replace them. */
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
 * Only the fields the preset actually sets: the update call treats an absent
 * key as "leave it alone". `qrUrl` null is a value of its own (hide the code).
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
