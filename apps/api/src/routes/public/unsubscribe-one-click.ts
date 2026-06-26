import { Hono } from "hono";

import { applyUnsubscribe } from "../../services/unsubscribe.js";
import type { Variables } from "../../types.js";

// RFC 8058 one-click unsubscribe (ADR-030). When the user taps the native
// "Unsubscribe" chip Gmail/Apple Mail render from the `List-Unsubscribe` /
// `List-Unsubscribe-Post` headers, the mail provider's servers POST this URL
// with a `List-Unsubscribe=One-Click` form body. The HMAC token in the query is
// the only credential (no session, no CSRF — the provider supplies neither), and
// the body is ignored. A machine endpoint with an empty response, so it stays a
// plain Hono route rather than an oRPC procedure. The in-body footer link is a
// separate human flow on the web app (`/unsubscribe`), which never mutates on GET.
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
