import { FLAG_CODES } from "@/lib/flag-codes";

/**
 * ISO 3166-1 alpha-2 country codes as the app displays them.
 *
 * Region names are pinned to `en`: the archive stores one code per event and
 * every reader sees the same label for it. This is the one `Intl` use the app
 * allows — the ban in `.oxlintrc.json` covers date and time formatting, where a
 * per-visitor locale caused hydration mismatches.
 */

const ALPHA_2 = /^[a-z]{2}$/u;

// `fallback: "none"` so an unknown code comes back undefined instead of being
// echoed as its own name, which would print "QQ" as a country.
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

/**
 * The code in the one shape everything here keys on.
 *
 * @returns The lower-cased alpha-2 code, or null when it is not one.
 */
export function normalizeCountryCode(code: string | null | undefined): string | null {
  if (code === null || code === undefined) {
    return null;
  }
  const lower = code.trim().toLowerCase();
  return ALPHA_2.test(lower) ? lower : null;
}

/**
 * The English country name for a code.
 *
 * @returns The name, or null when the code names no region.
 */
export function countryName(code: string | null | undefined): string | null {
  const lower = normalizeCountryCode(code);
  if (lower === null) {
    return null;
  }
  // ZZ is CLDR's "Unknown Region": a real entry, but not a country to print.
  if (lower === "zz") {
    return null;
  }
  return REGION_NAMES.of(lower.toUpperCase()) ?? null;
}

/**
 * The vendored flag image for a code (`scripts/vendor-flags.mjs`).
 *
 * @returns The public path, or null when no file was vendored for the code.
 */
export function flagIconPath(code: string | null | undefined): string | null {
  const lower = normalizeCountryCode(code);
  if (lower === null || !FLAG_CODES.has(lower)) {
    return null;
  }
  return `/images/flags/${lower}.webp`;
}

/**
 * The label a country control and a flag's `alt` use: the country's name where
 * there is one, the bare code otherwise, so an event from a code we cannot name
 * still says something.
 *
 * @returns The label, or null when there is no code at all.
 */
export function countryLabel(code: string | null | undefined): string | null {
  const lower = normalizeCountryCode(code);
  if (lower === null) {
    return null;
  }
  return countryName(lower) ?? lower.toUpperCase();
}
