/**
 * Stage-preset types. Declared on the contract (the zod schemas own the shape)
 * and re-exported here so the API's table types and the web app can reach them
 * from the package root, the same way the overlay types do.
 */
export type {
  CreateStagePreset,
  StageGround,
  StagePreset,
  StagePresetConfig,
  StagePresetListResponse,
  UpdateStagePreset,
} from "@openrift/shared/contracts/stage-presets";
