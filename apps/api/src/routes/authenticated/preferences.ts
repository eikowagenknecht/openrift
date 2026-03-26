import { zValidator } from "@hono/zod-validator";
import type { UserPreferencesResponse } from "@openrift/shared";
import { updatePreferencesSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";
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
  };
}

export const preferencesRoute = new Hono<{ Variables: Variables }>()
  .basePath("/preferences")
  .use(requireAuth)

  .get("/", async (c) => {
    const { userPreferences } = c.get("repos");
    const row = await userPreferences.getByUserId(getUserId(c));
    return c.json(toResponse(row));
  })

  .patch("/", zValidator("json", updatePreferencesSchema), async (c) => {
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

    const row = await userPreferences.upsert(userId, updates);
    return c.json(toResponse(row));
  });
