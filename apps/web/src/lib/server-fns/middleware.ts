import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Middleware that extracts the cookie header from the incoming SSR request
 * and passes it to server functions via context. This allows server functions
 * to forward cookies (auth session, etc.) when calling the API.
 *
 * @returns Middleware that provides `context.cookie` to downstream handlers.
 */
// oxlint-disable-next-line require-await -- TanStack middleware requires async server callback
export const withCookies = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  const cookie = request.headers.get("cookie") ?? "";
  return next({ context: { cookie } });
});
