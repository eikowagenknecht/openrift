import { getRequest } from "@tanstack/react-start/server";

/**
 * Reads the theme preference from the cookie during SSR to avoid a flash.
 *
 * @returns The CSS class to apply to the `<html>` element ("dark" or "").
 */
export function getServerThemeClass(): string {
  try {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    const match = cookieHeader.match(/(?:^|;\s*)theme=([^;]*)/);
    if (!match) {
      return "";
    }
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded);
    const pref = parsed?.state?.preference ?? "auto";
    // "auto" → "light" on server (no matchMedia), explicit "dark" → "dark"
    return pref === "dark" ? "dark" : "";
  } catch {
    return "";
  }
}
