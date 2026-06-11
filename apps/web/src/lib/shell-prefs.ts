import type { Palette } from "@openrift/shared";
import { PALETTES } from "@openrift/shared";

// Resolvers for the SSR shell preferences (theme class, palette attribute).
// Shared by the server functions in __root.tsx (reading the request cookie
// during SSR) and the client-side beforeLoad path (reading document.cookie),
// so both sides resolve the same cookie to the same value. The client MUST
// NOT fetch these over HTTP: root beforeLoad runs on every navigation,
// including search-param-only ones (filter clicks, search typing), and a
// network round trip there blocks the navigation.

/**
 * Resolve the raw `theme` cookie value (Zustand persist envelope,
 * `{"state":{"preference":...}}`) to the theme the SSR shell renders.
 * "auto" resolves to "light" — the server can't check matchMedia; the
 * blocking THEME_SCRIPT corrects the class on the client. The client-side
 * resolver mirrors that on purpose so client navigations render the same
 * <html> className the server would.
 *
 * @param raw - The decoded cookie value, or null/undefined when absent.
 * @returns The resolved theme, defaulting to "light".
 */
export function resolveThemeFromCookie(raw: string | null | undefined): "light" | "dark" {
  if (!raw) {
    return "light";
  }
  try {
    const parsed = JSON.parse(raw);
    const preference: string | undefined = parsed?.state?.preference;
    return preference === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * Resolve the raw `palette` cookie value to a known palette. Unknown values
 * are clamped so untrusted cookie content never reaches the DOM.
 *
 * @param raw - The decoded cookie value, or null/undefined when absent.
 * @returns The stored palette, or "default" when absent/invalid.
 */
export function resolvePaletteFromCookie(raw: string | null | undefined): Palette {
  if (!raw) {
    return "default";
  }
  try {
    const parsed = JSON.parse(raw);
    const preference: unknown = parsed?.state?.preference;
    if (typeof preference === "string" && (PALETTES as readonly string[]).includes(preference)) {
      return preference as Palette;
    }
    return "default";
  } catch {
    return "default";
  }
}

/**
 * Read a cookie from `document.cookie`. Mirrors the format written by
 * `cookie-storage.ts` (URL-encoded name and value).
 *
 * @param name - The cookie name.
 * @returns The decoded value, or null when missing or outside the browser.
 */
export function readClientCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const encoded = encodeURIComponent(name);
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${encoded}=`));
  if (!match) {
    return null;
  }
  return decodeURIComponent(match.split("=").slice(1).join("="));
}
