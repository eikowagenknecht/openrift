import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { userPreferencesResponseSchema } from "@openrift/shared/response-schemas";
import { updatePreferencesSchema } from "@openrift/shared/schemas";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { PartialPreferences } from "../../repositories/user-preferences.js";
import type { Variables } from "../../types.js";

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
    return c.json(row?.data ?? {});
  })

  .openapi(updatePreferences, async (c) => {
    const { userPreferences } = c.get("repos");
    const result = await userPreferences.upsert(
      getUserId(c),
      c.req.valid("json") as PartialPreferences,
    );
    return c.json(result);
  });
