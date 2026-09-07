import type {
  StagePreset,
  StagePresetListResponse,
} from "@openrift/shared/contracts/stage-presets";
import { MAX_STAGE_PRESETS, stagePresetsContract } from "@openrift/shared/contracts/stage-presets";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertFound } from "../../lib/assertions.js";
import { isUniqueViolationOn } from "../../lib/pg-errors.js";
import { toStagePreset } from "../../lib/stage-preset-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const NOT_FOUND = "Preset not found";
const NAME_TAKEN = "You already have a preset with that name";

function rethrowPresetError(error: unknown): never {
  if (isUniqueViolationOn(error, "uq_stage_presets_user_name")) {
    throw new AppError(409, ERROR_CODES.CONFLICT, NAME_TAKEN);
  }
  throw error;
}

const os = implement(stagePresetsContract).$context<ApiContext>().use(requireAuthedUser);

/** Every read and write is user-scoped in the repository; a preset belonging to someone else resolves to NOT_FOUND. */
export const stagePresetsRouter = {
  list: os.list.handler(async ({ context }): Promise<StagePresetListResponse> => {
    const rows = await context.repos.stagePresets.listForUser(context.userId);
    return { items: rows.map((row) => toStagePreset(row)) };
  }),

  create: os.create.handler(async ({ input, context }): Promise<StagePreset> => {
    // Check-then-act: a race landing a twenty-first preset is a cosmetic overrun.
    const count = await context.repos.stagePresets.countForUser(context.userId);
    if (count >= MAX_STAGE_PRESETS) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        `You can keep at most ${MAX_STAGE_PRESETS} presets. Delete one to make room.`,
      );
    }

    let row;
    try {
      // The contract's `.trim()` already normalized the name.
      row = await context.repos.stagePresets.create(context.userId, {
        name: input.name,
        config: input.config,
      });
    } catch (error) {
      rethrowPresetError(error);
    }
    return toStagePreset(row);
  }),

  update: os.update.handler(async ({ input, context }): Promise<StagePreset> => {
    const { id, name, config } = input;
    if (name === undefined && config === undefined) {
      // An empty SQL SET is invalid: nothing is written, and the current row is returned.
      const current = await context.repos.stagePresets.findByIdForUser(id, context.userId);
      assertFound(current, NOT_FOUND);
      return toStagePreset(current);
    }

    let row;
    try {
      row = await context.repos.stagePresets.update(id, context.userId, { name, config });
    } catch (error) {
      rethrowPresetError(error);
    }
    assertFound(row, NOT_FOUND);
    return toStagePreset(row);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const deleted = await context.repos.stagePresets.remove(input.id, context.userId);
    if (!deleted) {
      assertFound(undefined, NOT_FOUND);
    }
  }),
};
