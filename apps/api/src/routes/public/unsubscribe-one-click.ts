import { Hono } from "hono";

import { applyUnsubscribe } from "../../services/unsubscribe.js";
import type { Variables } from "../../types.js";

// RFC 8058 one-click unsubscribe: mail providers POST here with no session
// and no CSRF token, so the HMAC token in the query is the only credential
// and the form body is ignored. Plain Hono route since the response is empty.
export const unsubscribeOneClickRoute = new Hono<{ Variables: Variables }>().post(
  "/unsubscribe/one-click",
  async (c) => {
    const token = c.req.query("token");
    if (!token) {
      return c.body(null, 400);
    }
    const result = await applyUnsubscribe(c.get("repos"), c.get("config").auth.secret, token);
    return c.body(null, result === null ? 400 : 204);
  },
);
