import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { idParamSchema, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";
import {
  overlayCornerSchema,
  overlayPlateFieldsSchema,
  overlayPlatePositionSchema,
} from "./overlay.js";

extendZodWithOpenApi(z);

/**
 * Presets a single creator may keep. Well past the handful of scenes a channel
 * actually runs, and low enough that the recall menu stays a menu.
 */
export const MAX_STAGE_PRESETS = 20;

/** What the card sits against in presentation mode — the two chroma keys, or black. */
export const stageGroundSchema = z.enum(["black", "green", "magenta"]);

/**
 * A saved bundle of on-screen dressing for the creator tools.
 *
 * Every field is optional, and absent means "leave whatever the surface already
 * has". A preset stores only what it deliberately sets, so one that exists just
 * to swap the ground to green carries a single key and does not quietly drag a
 * plate layout along with it.
 *
 * The first six fields are the stream overlay's dressing (the same switches
 * `overlaySettingsSchema` patches); the last four belong to presentation mode.
 * One preset covers both because a creator dresses one stage, not two.
 */
export const stagePresetConfigSchema = z.object({
  showPlate: z.boolean().optional(),
  platePosition: overlayPlatePositionSchema.optional(),
  /**
   * Partial one key deep, for the same reason the whole config is partial: a
   * preset that turns the rules text on must not also mean "and hide the other
   * four lines".
   */
  plateFields: overlayPlateFieldsSchema.partial().optional(),
  /** Null is a value here (hide the QR); only absence means untouched. */
  qrUrl: z.string().url().max(2000).nullish(),
  corner: overlayCornerSchema.optional(),
  /** Card height as a percentage of the overlay source's height. */
  scale: z.number().int().min(20).max(100).optional(),
  /** Card size in presentation mode, as a fraction of the available height. */
  cardScale: z.number().min(0.4).max(1).optional(),
  /** Whether presentation mode shows the card's text beside the art. */
  showText: z.boolean().optional(),
  ground: stageGroundSchema.optional(),
  /** How far each tile in a stacked tier row is offset from the one under it. */
  tierTileStep: z.number().int().min(0).max(10).optional(),
});

const stagePresetFieldRules = {
  // Trimmed before min(1), so a whitespace-only name fails validation here
  // rather than surfacing later as a check-constraint violation.
  name: z.string().trim().min(1).max(60),
};

export const createStagePresetSchema = z.object({
  name: stagePresetFieldRules.name,
  config: stagePresetConfigSchema,
});

export const updateStagePresetSchema = z.object({
  name: stagePresetFieldRules.name.optional(),
  /**
   * Replaces the stored config wholesale rather than merging into it — the
   * editor holds the whole preset, and a merge would leave no way to unset a
   * field once it had been set.
   */
  config: stagePresetConfigSchema.optional(),
});

export const stagePresetConfigResponseSchema = stagePresetConfigSchema.openapi("StagePresetConfig");

export const stagePresetSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    config: stagePresetConfigResponseSchema,
  })
  .openapi("StagePreset");

export const stagePresetListResponseSchema = z
  .object({ items: z.array(stagePresetSchema) })
  .openapi("StagePresetListResponse");

export type StageGround = z.infer<typeof stageGroundSchema>;
export type StagePresetConfig = z.infer<typeof stagePresetConfigSchema>;
export type StagePreset = z.infer<typeof stagePresetSchema>;
export type StagePresetListResponse = z.infer<typeof stagePresetListResponseSchema>;
export type CreateStagePreset = z.infer<typeof createStagePresetSchema>;
export type UpdateStagePreset = z.infer<typeof updateStagePresetSchema>;

const TAG = "Stage presets";
const NOT_FOUND = { NOT_FOUND: { message: "Preset not found" } };
const NAME_TAKEN = { CONFLICT: { message: "You already have a preset with that name" } };

/**
 * oRPC contract for a creator's saved stage dressing, mounted at
 * `/api/v1/stage-presets`. Every route is session-gated and user-scoped, so an
 * id belonging to someone else reads as NOT_FOUND rather than FORBIDDEN.
 *
 * `create` shares CONFLICT between the duplicate name and the {@link
 * MAX_STAGE_PRESETS} cap: both mean "this create cannot stand", and the message
 * says which.
 */
export const stagePresetsContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/stage-presets", tags: [TAG] })
    .output(stagePresetListResponseSchema),
  create: authedRoute
    .route({ method: "POST", path: "/api/v1/stage-presets", tags: [TAG], successStatus: 201 })
    .input(createStagePresetSchema)
    .errors(NAME_TAKEN)
    .output(stagePresetSchema),
  update: authedRoute
    .route({ method: "PATCH", path: "/api/v1/stage-presets/{id}", tags: [TAG] })
    .input(withParams(idParamSchema, updateStagePresetSchema))
    .errors({ ...NOT_FOUND, ...NAME_TAKEN })
    .output(stagePresetSchema),
  remove: authedRoute
    .route({
      method: "DELETE",
      path: "/api/v1/stage-presets/{id}",
      tags: [TAG],
      successStatus: 204,
    })
    .input(idParamSchema)
    .errors(NOT_FOUND),
};

export type StagePresetsContract = typeof stagePresetsContract;
