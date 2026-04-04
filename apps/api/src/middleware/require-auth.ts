import type { MiddlewareHandler } from "hono";

import { AppError, ERROR_CODES } from "../errors.js";
import type { Variables } from "../types.js";

export const requireAuth: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }
  await next();
};
