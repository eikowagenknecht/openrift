import type { StagePreset, StagePresetConfig } from "@openrift/shared/contracts/stage-presets";
import { stagePresetConfigSchema } from "@openrift/shared/contracts/stage-presets";

import type { StagePresetRow } from "../repositories/stage-presets.js";

/** Unparseable blobs return `{}` and never throw. */
export function narrowStagePresetConfig(stored: unknown): StagePresetConfig {
  const parsed = stagePresetConfigSchema.safeParse(stored);
  return parsed.success ? parsed.data : {};
}

export function toStagePreset(row: StagePresetRow): StagePreset {
  return {
    id: row.id,
    name: row.name,
    config: narrowStagePresetConfig(row.config),
  };
}
