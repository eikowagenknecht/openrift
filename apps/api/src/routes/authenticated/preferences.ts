import { createRoute } from "@hono/zod-openapi";
import type { UserPreferencesResponse } from "@openrift/shared";
import { userPreferencesResponseSchema } from "@openrift/shared/response-schemas";
import { updatePreferencesSchema } from "@openrift/shared/schemas";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { createApiApp } from "../../openapi.js";
import type { PartialPreferences } from "../../repositories/user-preferences.js";

/**
 * Project stored preferences to the declared DTO. The JSONB `data`
 * column is cast, not validated, on read, so map it through an explicit pick so
 * only the documented fields reach the wire — no stray persisted keys leak.
 * @returns The user preferences in the {@link userPreferencesResponseSchema} shape.
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
    // read back by it; they must round-trip. Previously dropped here, so
    // `languages` never returned and `completionScope` was lost entirely.
    languages: data.languages,
    completionScope: data.completionScope,
    defaultCardView: data.defaultCardView,
    defaultCurrency: data.defaultCurrency,
  };
}

const getPreferences = createRoute({
  method: "get",
  path: "/",
  tags: ["Preferences"],
  responses: {
    200: {
      content: { "application/json": { schema: userPreferencesResponseSchema } },
      description: "Success",
    },
  },
});

const updatePreferences = createRoute({
  method: "patch",
  path: "/",
  tags: ["Preferences"],
  request: {
    body: { content: { "application/json": { schema: updatePreferencesSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: userPreferencesResponseSchema } },
      description: "Success",
    },
  },
});

const preferencesApp = createApiApp().basePath("/preferences");
preferencesApp.use(requireAuth);
export const preferencesRoute = preferencesApp
  .openapi(getPreferences, async (c) => {
    const { userPreferences } = c.get("repos");
    const row = await userPreferences.getByUserId(getUserId(c));
    return c.json(toUserPreferences(row?.data ?? {}));
  })

  .openapi(updatePreferences, async (c) => {
    const { userPreferences } = c.get("repos");
    const result = await userPreferences.upsert(
      getUserId(c),
      c.req.valid("json") as PartialPreferences,
    );
    return c.json(toUserPreferences(result));
  });
