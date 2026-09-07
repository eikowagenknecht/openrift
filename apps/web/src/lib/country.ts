import { FLAG_CODES } from "@/lib/flag-codes";

// Region names are pinned to `en` regardless of visitor locale, the one `Intl` use the
// `.oxlintrc.json` ban (date/time formatting causes hydration mismatches) doesn't cover.

const ALPHA_2 = /^[a-z]{2}$/u;

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

export function normalizeCountryCode(code: string | null | undefined): string | null {
  if (code === null || code === undefined) {
    return null;
  }
  const lower = code.trim().toLowerCase();
  return ALPHA_2.test(lower) ? lower : null;
}

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

export function flagIconPath(code: string | null | undefined): string | null {
  const lower = normalizeCountryCode(code);
  if (lower === null || !FLAG_CODES.has(lower)) {
    return null;
  }
  return `/images/flags/${lower}.webp`;
}

export function countryLabel(code: string | null | undefined): string | null {
  const lower = normalizeCountryCode(code);
  if (lower === null) {
    return null;
  }
  return countryName(lower) ?? lower.toUpperCase();
}
