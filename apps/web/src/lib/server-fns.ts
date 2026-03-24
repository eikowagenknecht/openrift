import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/**
 * Fetch the current user session during SSR.
 * Reads cookies from the incoming request and forwards them to the auth API.
 * During client-side navigation, this makes an RPC call to the server which
 * automatically receives the browser's cookies.
 */
export const fetchSession = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  const cookie = headers.cookie;

  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: cookie ? { cookie } : {},
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { session: unknown; user: unknown } | null;
  return data;
});

/**
 * Get the cookie header from the incoming SSR request.
 * Used by route loaders to forward cookies when making authenticated API calls.
 */
export const getSSRCookieHeader = createServerFn({ method: "GET" }).handler(() => {
  const headers = getRequestHeaders();
  return headers.cookie ?? null;
});
