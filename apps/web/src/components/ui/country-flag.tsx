import { countryLabel, flagIconPath, normalizeCountryCode } from "@/lib/country";
import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// The flags are vendored WebP served as a plain <img> src, the same way the
// domain runes are — see scripts/vendor-flags.mjs. A code with no vendored file
// falls back to the code alone rather than a broken image well, because the
// archive takes its country codes from tournament sources and cannot promise
// every one of them is a country the package draws.

type CountryFlagSize = "sm" | "default";

const PLATE_CLASS: Record<CountryFlagSize, string> = {
  sm: "h-3 w-4",
  default: "h-4.5 w-6",
};

const CODE_CLASS: Record<CountryFlagSize, string> = {
  sm: "text-2xs",
  default: "text-xs",
};

/**
 * A country as the archive prints it: the flag beside its ISO code.
 *
 * @param code - ISO 3166-1 alpha-2, in either case. Null renders nothing.
 * @param showCode - Set false where the surrounding text already names the
 *   country and the flag is decoration. A code with no flag ignores it: the
 *   code is all there is to show.
 * @returns The flag element, or null when there is no usable code.
 */
export function CountryFlag({
  code,
  showCode = true,
  size = "default",
  className,
}: {
  code: string | null | undefined;
  showCode?: boolean;
  size?: CountryFlagSize;
  className?: string;
}) {
  const normalized = normalizeCountryCode(code);
  if (normalized === null) {
    return null;
  }

  const label = countryLabel(normalized) ?? normalized.toUpperCase();
  const src = flagIconPath(normalized);
  const iso = normalized.toUpperCase();

  if (src === null) {
    return (
      <span
        data-slot="country-flag"
        className={cn(
          "bg-muted text-muted-foreground ring-foreground/15 inline-flex shrink-0 items-center rounded-xs px-1 font-medium ring-1 ring-inset",
          CODE_CLASS[size],
          className,
        )}
      >
        {/* The plate shows the code; the name is what a reader needs said. */}
        <span aria-hidden>{iso}</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <span
      data-slot="country-flag"
      className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
    >
      <img
        src={src}
        alt={label}
        loading="lazy"
        className={cn(
          "ring-foreground/15 rounded-xs object-cover ring-1 ring-inset",
          PLATE_CLASS[size],
        )}
      />
      {/* The alt already said the country; the code would be a second reading of it. */}
      {showCode && (
        <span aria-hidden className={cn("text-muted-foreground font-medium", CODE_CLASS[size])}>
          {iso}
        </span>
      )}
    </span>
  );
}
