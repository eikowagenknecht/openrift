import type { MiddlewareHandler } from "hono";

import { AppError } from "../errors.js";
import type { Variables } from "../types.js";

export const requireAuth: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }
  await next();
};
