import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// oxlint-disable-next-line require-await -- TanStack middleware requires async server callback
export const withCookies = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  const cookie = request.headers.get("cookie") ?? "";
  return next({ context: { cookie } });
});
