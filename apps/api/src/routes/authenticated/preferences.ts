import type { UserPreferencesResponse } from "@openrift/shared";
import { preferencesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUserId } from "../../middleware/get-user-id.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { PartialPreferences } from "../../repositories/user-preferences.js";

/**
 * Project stored preferences to the declared DTO. The JSONB `data` column is
 * cast, not validated, on read, so map it through an explicit pick so only the
 * documented fields reach the wire — no stray persisted keys leak.
 * @returns The user preferences in the {@link UserPreferencesResponse} shape.
 */
function toUserPreferences(data: UserPreferencesResponse): UserPreferencesResponse {
  return {
    showImages: data.showImages,
    fancyFan: data.fancyFan,
    foilEffect: data.foilEffect,
    cardTilt: data.cardTilt,
    theme: data.theme,
    palette: data.palette,
    marketplaceOrder: data.marketplaceOrder,
    // languages + completionScope are sent by the web (use-preferences-sync) and
    // read back by it; they must round-trip.
    languages: data.languages,
    completionScope: data.completionScope,
    defaultCardView: data.defaultCardView,
    defaultCurrency: data.defaultCurrency,
    hiddenFilterSections: data.hiddenFilterSections,
    // ADR-030: the profile email-notification toggles read this back.
    emailNotifications: data.emailNotifications,
  };
}

const os = implement(preferencesContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the authenticated preferences contract. The
 * fail-closed `requireUser` middleware gates every procedure (this contract
 * carries no `auth: "public"` meta), so `requireUserId(context.user)` always
 * resolves a viewer.
 */
export const preferencesRouter = {
  get: os.get.handler(async ({ context }): Promise<UserPreferencesResponse> => {
    const { userPreferences } = context.repos;
    const row = await userPreferences.getByUserId(requireUserId(context.user));
    return toUserPreferences(row?.data ?? {});
  }),

  update: os.update.handler(async ({ input, context }): Promise<UserPreferencesResponse> => {
    const { userPreferences } = context.repos;
    const result = await userPreferences.upsert(
      requireUserId(context.user),
      input as PartialPreferences,
    );
    return toUserPreferences(result);
  }),
};
