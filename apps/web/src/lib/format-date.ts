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
    // The app shows times in 24h format everywhere; en-US alone would emit AM/PM.
    hourCycle: "h23",
    ...options,
  });
}

/**
 * The parts of a {@link DateLeaf} (the calendar-leaf date tile) for a stored
 * instant, in the VIEWER's local timezone and locale. Unlike
 * {@link formatAbsoluteDate} this is deliberately not SSR-deterministic — its
 * consumers (the events timeline, the group activity feed) are client-only.
 *
 * @returns The uppercase short month and the day of month, e.g. `JUL` / `13`.
 */
export function dateLeafParts(iso: string): { month: string; day: string } {
  const date = new Date(iso);
  return {
    month: date.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
    day: date.toLocaleDateString(undefined, { day: "numeric" }),
  };
}
