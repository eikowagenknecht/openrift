import type { StagePreset, StagePresetConfig } from "@openrift/shared";
import { stagePresetConfigSchema } from "@openrift/shared/contracts/stage-presets";

import type { StagePresetRow } from "../repositories/stage-presets.js";

/**
 * Narrows a stored config blob to the shape the contract promises.
 *
 * The column is opaque jsonb that grows a switch at a time, so a row can hold
 * keys this build has never heard of (written by a newer deploy, or by hand),
 * and in principle a value of the wrong type. Every field is optional, so the
 * schema strips the unknown keys and a blob that is not an object at all
 * degrades to `{}` — the preset applies nothing and the surface keeps its
 * defaults. Throwing instead would take down the whole list over one bad row,
 * and on the public overlay read it would blank a live stream.
 *
 * @returns The config as the contract's shape, or `{}` when it cannot be read.
 */
export function narrowStagePresetConfig(stored: unknown): StagePresetConfig {
  const parsed = stagePresetConfigSchema.safeParse(stored);
  return parsed.success ? parsed.data : {};
}

/**
 * Maps a preset row to the owner-facing response. The row id and owner stay
 * server-side beyond the id itself, which is the handle every write and the
 * overlay's `presetId` use.
 * @returns The preset as a `StagePreset`.
 */
export function toStagePreset(row: StagePresetRow): StagePreset {
  return {
    id: row.id,
    name: row.name,
    config: narrowStagePresetConfig(row.config),
  };
}
