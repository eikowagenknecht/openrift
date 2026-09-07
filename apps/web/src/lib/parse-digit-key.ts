// DOM types promise `key` is a string, but synthetic events from password
// managers and autofill extensions can omit it.
export function parseDigitKey(key: string | undefined): number | null {
  if (typeof key !== "string" || key.length !== 1) {
    return null;
  }
  const value = Number(key);
  return Number.isInteger(value) && value >= 1 && value <= 9 ? value : null;
}

// A stack drag already carries one copy with no key held, so only 2-9 mean
// anything as a move modifier.
export function parseMoveDigit(key: string | undefined): number | null {
  const digit = parseDigitKey(key);
  return digit !== null && digit >= 2 ? digit : null;
}
