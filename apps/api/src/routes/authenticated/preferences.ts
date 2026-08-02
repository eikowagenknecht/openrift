import type { UserPreferencesResponse } from "@openrift/shared";
import { preferencesContract, userPreferencesResponseSchema } from "@openrift/shared/contracts";
import { createLogger } from "@openrift/shared/logger";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { PartialPreferences } from "../../repositories/user-preferences.js";

const log = createLogger("preferences");

/** Per-field schemas of the response DTO — the pick list and the validator in one. */
const preferenceFields = Object.entries(userPreferencesResponseSchema.shape);

/**
 * Project stored preferences to the declared DTO, field by field.
 *
 * The JSONB `data` column is cast, not validated, on read, so walking the
 * response schema's own fields does two jobs: only documented keys reach the
 * wire (no stray persisted key leaks), and a stored value the schema no longer
 * accepts is dropped rather than allowed through to fail oRPC's output
 * validation. That failure is a 500 on the whole response, and since the web
 * loads preferences on every page, one stale value (a preference written before
 * an enum narrowed, say) bricks the app for that user — OPENRIFT-API-B. Dropping
 * the key instead falls back to `PREFERENCE_DEFAULTS` on the client, and the
 * warn log names the field so the stored data can be corrected.
 * @returns The user preferences in the {@link UserPreferencesResponse} shape.
 */
function toUserPreferences(data: UserPreferencesResponse, userId: string): UserPreferencesResponse {
  // Defensive: `data` is whatever the JSONB column held (the repo runs it
  // through parseJsonbRequired), which the Kysely types promise is an object
  // but the database does not.
  if (typeof data !== "object" || data === null) {
    log.warn({ userId, type: typeof data }, "stored preferences are not an object");
    return {};
  }
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

/**
 * oRPC implementation of the authenticated preferences contract. The
 * fail-closed `requireAuthedUser` middleware gates every procedure (this contract
 * carries no `auth: "public"` meta), so `context.userId` always
 * resolves a viewer.
 */
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
