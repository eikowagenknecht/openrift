/**
 * Parse a keyboard event's `key` into a digit 1-9.
 *
 * The DOM types promise `key` is a string, but synthetic keyboard events
 * dispatched by password managers and autofill extensions can omit it, so a
 * non-string value must read as "no digit" instead of throwing.
 *
 * @returns The digit 1-9, or null for any other key.
 */
export function parseDigitKey(key: string | undefined): number | null {
  if (typeof key !== "string" || key.length !== 1) {
    return null;
  }
  const value = Number(key);
  return Number.isInteger(value) && value >= 1 && value <= 9 ? value : null;
}

/**
 * The drag-quantity variant. A stack drag already carries one copy with no key
 * held, so only 2-9 mean anything as a move modifier.
 *
 * @returns The digit 2-9, or null for any other key.
 */
export function parseMoveDigit(key: string | undefined): number | null {
  const digit = parseDigitKey(key);
  return digit !== null && digit >= 2 ? digit : null;
}
