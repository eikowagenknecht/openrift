import type { Palette } from "@openrift/shared/types/api/preferences";
import { PALETTES } from "@openrift/shared/types/api/preferences";

// The client-side resolver here MUST NOT fetch over HTTP: root beforeLoad runs on every
// navigation, including search-param-only ones, and a network round trip would block it.

// "auto" resolves to "light": the server can't check matchMedia, and the blocking
// THEME_SCRIPT corrects the class on the client.
export function resolveThemeFromCookie(raw: string | null | undefined): "light" | "dark" {
  if (!raw) {
    return "dark";
  }
  try {
    const parsed = JSON.parse(raw) as { state?: { preference?: unknown } } | null;
    const preference = parsed?.state?.preference;
    if (preference === "light" || preference === "auto") {
      return "light";
    }
    return "dark";
  } catch {
    return "dark";
  }
}

// Unknown values are clamped so untrusted cookie content never reaches the DOM.
export function resolvePaletteFromCookie(raw: string | null | undefined): Palette {
  if (!raw) {
    return "default";
  }
  try {
    const parsed = JSON.parse(raw) as { state?: { preference?: unknown } } | null;
    const preference = parsed?.state?.preference;
    if (typeof preference === "string" && (PALETTES as readonly string[]).includes(preference)) {
      return preference as Palette;
    }
    return "default";
  } catch {
    return "default";
  }
}

// Mirrors the cookie format written by cookie-storage.ts (URL-encoded name and value).
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
