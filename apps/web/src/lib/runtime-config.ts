import type { AppEnv } from "@openrift/shared/app-env";

interface RuntimeConfig {
  sentryDsn: string;
  appEnv: AppEnv;
}

// Built via fromCodePoint, not typed directly: editors and formatters can
// silently strip or normalize a raw U+2028/U+2029 in a literal.
const LS = String.fromCodePoint(0x20_28);
const PS = String.fromCodePoint(0x20_29);
const LINE_TERMINATORS = new RegExp(`[${LS}${PS}]`, "gu");
const OPEN_BRACKET = /</gu;

/**
 * Escapes `</` and U+2028/U+2029 (line terminators JSON allows raw in
 * strings but JavaScript doesn't) so the result is safe inside a `<script>`.
 */
export function runtimeConfigScript(config: RuntimeConfig): string {
  // oxlint-disable unicorn/prefer-string-raw -- the suggested String.raw rewrite interprets \uXXXX as literal code points, defeating the escape.
  const json = JSON.stringify(config)
    .replace(OPEN_BRACKET, "\\u003c")
    .replace(
      LINE_TERMINATORS,
      (ch) => `\\u${(ch.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`,
    );
  // oxlint-enable unicorn/prefer-string-raw
  return `globalThis.__OPENRIFT_CONFIG__=${json};`;
}
