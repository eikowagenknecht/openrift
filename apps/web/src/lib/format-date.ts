/**
 * Formats a calendar date (a `YYYY-MM-DD` string or a full ISO timestamp) into
 * an absolute, human-readable string that renders identically on the server and
 * the client.
 *
 * The server and the browser run in different timezones and locales: a
 * datacenter server is typically UTC with a `C`/`en-US` locale, while the
 * browser uses the visitor's locale and timezone. `toLocaleDateString` with an
 * `undefined` locale or no `timeZone` therefore emits different text on each
 * side, which during SSR hydration triggers a React mismatch (error #418).
 * Pinning both `locale` and `timeZone` makes the output deterministic so the
 * server HTML matches the client's first render.
 *
 * Date-only inputs like `"2026-06-08"` parse as UTC midnight per the ECMAScript
 * spec, so formatting them in UTC keeps the same calendar day everywhere.
 *
 * @returns The formatted date string.
 */
export function formatAbsoluteDate(input: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(input).toLocaleDateString("en-US", {
    timeZone: "UTC",
    ...options,
  });
}
