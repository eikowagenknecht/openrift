import { adminFeatureFlagsContract } from "@openrift/shared/contracts/admin/feature-flags";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { FeatureFlagResponse } from "@openrift/shared/types/api/admin";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertDeleted, assertFound } from "../../lib/assertions.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminFeatureFlagsContract).$context<ApiContext>().use(requireAuthedUser);

export const adminFeatureFlagsRouter = {
  list: os.list.handler(async ({ context }) => {
    const { featureFlags: flagsRepo } = context.repos;
    const rows = await flagsRepo.listAll();
    return {
      flags: rows.map((r): FeatureFlagResponse => ({
        key: r.key,
        enabled: r.enabled,
        description: r.description,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }),

  create: os.create.handler(async ({ input, context }): Promise<void> => {
    const { featureFlags: flagsRepo } = context.repos;
    const { key, description, enabled } = input;
    const created = await flagsRepo.create({
      key,
      enabled: enabled ?? false,
      description: description ?? null,
    });
    if (!created) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Flag "${key}" already exists`);
    }
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { featureFlags: flagsRepo } = context.repos;
    const { key, ...body } = input;
    const updated = await flagsRepo.update(key, body);
    assertFound(updated, `Flag "${key}" not found`);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { featureFlags: flagsRepo } = context.repos;
    const result = await flagsRepo.deleteByKey(input.key);
    assertDeleted(result, `Flag "${input.key}" not found`);
  }),

  listOverrides: os.listOverrides.handler(async ({ context }) => {
    const { userFeatureFlags } = context.repos;
    const rows = await userFeatureFlags.listAllWithUsers();
    return { overrides: rows };
  }),

  upsertOverride: os.upsertOverride.handler(async ({ input, context }) => {
    const { userFeatureFlags } = context.repos;
    const { id, key, enabled } = input;
    const result = await userFeatureFlags.upsert(id, key, enabled);
    if (!result) {
      throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, "Failed to set override");
    }
    return { flagKey: key, enabled };
  }),

  removeOverride: os.removeOverride.handler(async ({ input, context }): Promise<void> => {
    const { userFeatureFlags } = context.repos;
    const { id, key } = input;
    const result = await userFeatureFlags.delete(id, key);
    assertDeleted(result, `Override for flag "${key}" not found for this user`);
  }),
};
