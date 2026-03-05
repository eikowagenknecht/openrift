import type { MiddlewareHandler } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

export const requireAdmin: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const admin = await db
    .selectFrom("admins")
    .select("user_id")
    .where("user_id", "=", user.id)
    .executeTakeFirst();

  if (!admin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await next();
};
