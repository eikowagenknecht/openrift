import type { ShoppingListResponse } from "@openrift/shared";
import { Hono } from "hono";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { Variables } from "../../types.js";

/** Unified "still needed" view: wanted deck shortfalls + wish list items. */
export const shoppingListRoute = new Hono<{ Variables: Variables }>()
  .basePath("/shopping-list")
  .use(requireAuth)
  .get("/", async (c) => {
    const { buildShoppingList } = c.get("services");
    const repos = c.get("repos");
    const userId = getUserId(c);
    const items = await buildShoppingList(repos, userId);
    const result: ShoppingListResponse = { items };
    return c.json(result);
  });
