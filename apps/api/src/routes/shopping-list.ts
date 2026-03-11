import { Hono } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getUserId } from "../middleware/get-user-id.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAuth } from "../middleware/require-auth.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { buildShoppingList } from "../services/shopping-list.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

export const shoppingListRoute = new Hono<{ Variables: Variables }>();

shoppingListRoute.use("/shopping-list", requireAuth);

// ── GET /shopping-list ────────────────────────────────────────────────────────
// Unified "still needed" view: wanted deck shortfalls + wish list items

shoppingListRoute.get("/shopping-list", async (c) => {
  const userId = getUserId(c);
  const items = await buildShoppingList(db, userId);
  return c.json({ items });
});
