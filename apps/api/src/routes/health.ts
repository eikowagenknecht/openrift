import { Hono } from "hono";

import type { Variables } from "../types.js";

export const healthRoute = new Hono<{ Variables: Variables }>().get("/health", async (c) => {
  const { sets } = c.get("repos");

  if (!(await sets.ping())) {
    return c.json({ status: "db_unreachable" }, 503);
  }

  try {
    if (!(await sets.hasAny())) {
      return c.json({ status: "db_empty" }, 503);
    }
  } catch {
    return c.json({ status: "db_not_migrated" }, 503);
  }

  return c.json({ status: "ok" });
});
