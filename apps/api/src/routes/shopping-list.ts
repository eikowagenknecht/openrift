import { Hono } from "hono";

import { db } from "../db.js";
import { getUserId } from "../middleware/get-user-id.js";
import { requireAuth } from "../middleware/require-auth.js";
import { buildShoppingList } from "../services/shopping-list.js";
import type { Variables } from "../types.js";

// ── GET /shopping-list ────────────────────────────────────────────────────────
// Unified "still needed" view: wanted deck shortfalls + wish list items

export const shoppingListRoute = new Hono<{ Variables: Variables }>()
  .use("/shopping-list", requireAuth)
  .get("/shopping-list", async (c) => {
    const userId = getUserId(c);
    const items = await buildShoppingList(db, userId);
    return c.json({ items });
  });
