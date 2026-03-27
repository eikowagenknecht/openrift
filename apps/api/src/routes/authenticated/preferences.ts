import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { Marketplace, UserPreferencesResponse } from "@openrift/shared";
import { ALL_MARKETPLACES } from "@openrift/shared";
import { userPreferencesResponseSchema } from "@openrift/shared/response-schemas";
import { updatePreferencesSchema } from "@openrift/shared/schemas";
import type { Selectable } from "kysely";

import type { UserPreferencesTable } from "../../db/index.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { Variables } from "../../types.js";

const DEFAULTS: UserPreferencesResponse = {
  showImages: true,
  richEffects: true,
  visibleFields: { number: true, title: true, type: true, rarity: true, price: true },
  theme: "light",
  marketplaceOrder: [...ALL_MARKETPLACES],
};

function toResponse(row: Selectable<UserPreferencesTable> | undefined): UserPreferencesResponse {
  if (!row) {
    return DEFAULTS;
  }
  return {
    showImages: row.showImages,
    richEffects: row.richEffects,
    visibleFields: {
      number: row.cardFieldNumber,
      title: row.cardFieldTitle,
      type: row.cardFieldType,
      rarity: row.cardFieldRarity,
      price: row.cardFieldPrice,
    },
    theme: row.theme as "light" | "dark",
    marketplaceOrder: row.marketplaceOrder as Marketplace[],
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

const preferencesApp = new OpenAPIHono<{ Variables: Variables }>().basePath("/preferences");
preferencesApp.use(requireAuth);
export const preferencesRoute = preferencesApp
  .openapi(getPreferences, async (c) => {
    const { userPreferences } = c.get("repos");
    const row = await userPreferences.getByUserId(getUserId(c));
    return c.json(toResponse(row));
  })

  .openapi(updatePreferences, async (c) => {
    const { userPreferences } = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");

    const updates: Record<string, unknown> = {};
    if (body.showImages !== undefined) {
      updates.showImages = body.showImages;
    }
    if (body.richEffects !== undefined) {
      updates.richEffects = body.richEffects;
    }
    if (body.theme !== undefined) {
      updates.theme = body.theme;
    }
    if (body.visibleFields) {
      if (body.visibleFields.number !== undefined) {
        updates.cardFieldNumber = body.visibleFields.number;
      }
      if (body.visibleFields.title !== undefined) {
        updates.cardFieldTitle = body.visibleFields.title;
      }
      if (body.visibleFields.type !== undefined) {
        updates.cardFieldType = body.visibleFields.type;
      }
      if (body.visibleFields.rarity !== undefined) {
        updates.cardFieldRarity = body.visibleFields.rarity;
      }
      if (body.visibleFields.price !== undefined) {
        updates.cardFieldPrice = body.visibleFields.price;
      }
    }

    if (body.marketplaceOrder !== undefined) {
      updates.marketplaceOrder = JSON.stringify(body.marketplaceOrder);
    }

    const row = await userPreferences.upsert(userId, updates);
    return c.json(toResponse(row));
  });
