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

export const MAX_STAGE_PRESETS = 20;

export const stageGroundSchema = z.enum(["black", "green", "magenta"]);

/** Every field is optional; absent means "leave whatever the surface already has". */
export const stagePresetConfigSchema = z.object({
  showPlate: z.boolean().optional(),
  platePosition: overlayPlatePositionSchema.optional(),
  plateFields: overlayPlateFieldsSchema.partial().optional(),
  qrUrl: z.url().max(2000).nullish(),
  corner: overlayCornerSchema.optional(),
  scale: z.number().int().min(20).max(100).optional(),
  cardScale: z.number().min(0.4).max(1).optional(),
  showText: z.boolean().optional(),
  ground: stageGroundSchema.optional(),
  tierTileStep: z.number().int().min(0).max(10).optional(),
});

const stagePresetFieldRules = {
  name: z.string().trim().min(1).max(60),
};

export const createStagePresetSchema = z.object({
  name: stagePresetFieldRules.name,
  config: stagePresetConfigSchema,
});

export const updateStagePresetSchema = z.object({
  name: stagePresetFieldRules.name.optional(),
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

/** An id belonging to someone else reads as NOT_FOUND, not FORBIDDEN. */
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
