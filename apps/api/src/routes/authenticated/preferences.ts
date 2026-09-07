import type { UserPreferencesResponse } from "@openrift/shared";
import {
  preferencesContract,
  userPreferencesResponseSchema,
} from "@openrift/shared/contracts/preferences";
import { createLogger } from "@openrift/shared/logger";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { PartialPreferences } from "../../repositories/user-preferences.js";

const log = createLogger("preferences");

const preferenceFields = Object.entries(userPreferencesResponseSchema.shape);

/**
 * The JSONB `data` column is cast, not validated, on read. A stored value the
 * response schema rejects is dropped; it does not fail oRPC output validation.
 */
function toUserPreferences(data: UserPreferencesResponse, userId: string): UserPreferencesResponse {
  const record = data as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [field, schema] of preferenceFields) {
    const value = record[field];
    if (value === undefined) {
      continue;
    }
    const parsed = schema.safeParse(value);
    if (parsed.success) {
      projected[field] = parsed.data;
    } else {
      dropped.push(field);
    }
  }
  if (dropped.length > 0) {
    log.warn({ userId, dropped }, "dropped stored preferences the response schema rejects");
  }
  return projected as UserPreferencesResponse;
}

const os = implement(preferencesContract).$context<ApiContext>().use(requireAuthedUser);

/** `requireAuthedUser` gates every procedure, so `context.userId` always resolves a viewer. */
export const preferencesRouter = {
  get: os.get.handler(async ({ context }): Promise<UserPreferencesResponse> => {
    const { userPreferences } = context.repos;
    const row = await userPreferences.getByUserId(context.userId);
    return toUserPreferences(row?.data ?? {}, context.userId);
  }),

  update: os.update.handler(async ({ input, context }): Promise<UserPreferencesResponse> => {
    const { userPreferences } = context.repos;
    const result = await userPreferences.upsert(context.userId, input as PartialPreferences);
    return toUserPreferences(result, context.userId);
  }),
};
