/**
 * Parse a keyboard event's `key` into a move-copies digit (2-9).
 *
 * The DOM types promise `key` is a string, but synthetic keyboard events
 * dispatched by password managers and autofill extensions can omit it, so a
 * non-string value must read as "no digit" instead of throwing.
 *
 * @returns The digit 2-9, or null for any other key.
 */
export function parseMoveDigit(key: string | undefined): number | null {
  if (typeof key !== "string" || key.length !== 1) {
    return null;
  }
  const value = Number(key);
  return Number.isInteger(value) && value >= 2 && value <= 9 ? value : null;
}
