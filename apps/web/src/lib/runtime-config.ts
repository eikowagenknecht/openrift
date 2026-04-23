import type { SiteSettings } from "@/lib/site-settings";

export interface RuntimeConfig {
  sentryDsn: string;
}

function getRuntimeConfig(siteSettings: SiteSettings): RuntimeConfig {
  return { sentryDsn: siteSettings["sentry-dsn"] ?? "" };
}

// Build the regex from fromCodePoint so the source stays pure ASCII. Typing
// U+2028/U+2029 directly in a regex literal or template literal is fragile:
// editors and formatters can silently strip or normalize them.
const LS = String.fromCodePoint(0x20_28);
const PS = String.fromCodePoint(0x20_29);
const LINE_TERMINATORS = new RegExp(`[${LS}${PS}]`, "g");
const OPEN_BRACKET = /</g;

/**
 * Serialize runtime config as a `<script>` body. Inlined by the SSR shell so
 * values from site_settings are available on `globalThis.__OPENRIFT_CONFIG__`
 * before hydration (needed by `initSentry()` in client.tsx).
 *
 * Escapes sequences that could break out of a `<script>` block: `</` (any
 * closing tag) and U+2028/U+2029, which JSON allows raw in strings but
 * JavaScript treats as line terminators.
 *
 * @returns A JS statement assigning the config to `globalThis.__OPENRIFT_CONFIG__`.
 */
export function runtimeConfigScript(siteSettings: SiteSettings): string {
  // oxlint-disable unicorn/prefer-string-raw -- the suggested String.raw rewrite interprets \uXXXX as literal code points, defeating the escape.
  const json = JSON.stringify(getRuntimeConfig(siteSettings))
    .replace(OPEN_BRACKET, "\\u003c")
    .replace(
      LINE_TERMINATORS,
      (ch) => `\\u${(ch.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`,
    );
  // oxlint-enable unicorn/prefer-string-raw
  return `globalThis.__OPENRIFT_CONFIG__=${json};`;
}
