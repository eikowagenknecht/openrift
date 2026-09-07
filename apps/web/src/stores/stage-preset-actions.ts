import type { StagePresetConfig } from "@openrift/shared/contracts/stage-presets";

import { presetToStagePatch } from "@/lib/stage-preset-apply";
import { useDisplayStore } from "@/stores/display-store";
import { usePresentationStore } from "@/stores/presentation-store";

/**
 * The single place both callers (the settings popover's picker and
 * `/stage?preset=`) apply a preset, so recall behaves the same either way.
 */
export function applyStagePresetConfig(config: StagePresetConfig): void {
  const patch = presetToStagePatch(config, usePresentationStore.getState().plateFields);
  usePresentationStore.setState(patch.stage);
  if (patch.tierTileStep !== undefined) {
    useDisplayStore.getState().setTierTileStep(patch.tierTileStep);
  }
}
