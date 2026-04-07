import { getRequest } from "@tanstack/react-start/server";

/**
 * Returns the cookie header from the incoming SSR request.
 *
 * @returns The raw cookie header string, or "" if unavailable.
 */
export function getRequestCookieHeader(): string {
  try {
    const request = getRequest();
    return request.headers.get("cookie") ?? "";
  } catch {
    return "";
  }
}
