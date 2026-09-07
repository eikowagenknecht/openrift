import type { Palette } from "@openrift/shared";
import { PALETTES } from "@openrift/shared";

// The client-side resolver here MUST NOT fetch over HTTP: root beforeLoad runs on every
// navigation, including search-param-only ones, and a network round trip would block it.

// "auto" resolves to "light": the server can't check matchMedia, and the blocking
// THEME_SCRIPT corrects the class on the client.
export function resolveThemeFromCookie(raw: string | null | undefined): "light" | "dark" {
  if (!raw) {
    return "light";
  }
  try {
    const parsed = JSON.parse(raw) as { state?: { preference?: unknown } } | null;
    const preference = parsed?.state?.preference;
    return preference === "dark" ? "dark" : "light";
  } catch {
    return "light";
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
