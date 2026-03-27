import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ShoppingListResponse } from "@openrift/shared";
import { shoppingListResponseSchema } from "@openrift/shared/response-schemas";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { Variables } from "../../types.js";

const getShoppingList = createRoute({
  method: "get",
  path: "/",
  tags: ["Shopping List"],
  responses: {
    200: {
      content: { "application/json": { schema: shoppingListResponseSchema } },
      description: "Success",
    },
  },
});

/** Unified "still needed" view: wanted deck shortfalls + wish list items. */
const shoppingListApp = new OpenAPIHono<{ Variables: Variables }>().basePath("/shopping-list");
shoppingListApp.use(requireAuth);
export const shoppingListRoute = shoppingListApp.openapi(getShoppingList, async (c) => {
  const { buildShoppingList } = c.get("services");
  const repos = c.get("repos");
  const userId = getUserId(c);
  const items = await buildShoppingList(repos, userId);
  const result: ShoppingListResponse = { items };
  return c.json(result);
});
