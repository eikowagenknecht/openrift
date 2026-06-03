import { ERROR_CODES } from "@openrift/shared";
import type { MiddlewareHandler } from "hono";

import { AppError } from "../errors.js";
import type { Variables } from "../types.js";
import { resolveSession } from "./load-session.js";

export const requireAuth: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  await resolveSession(c);
  if (!c.get("user")) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }
  await next();
};
