// Client-side UUIDv7 (ADR-027 step 2): copies are inserted optimistically
// into the synced collection with their final id, so the row the server
// replicates back through Electric is the same row — no temp-id swap.
// Version 7 (not crypto.randomUUID's v4) to match the `uuidv7()` column
// default: ids stay time-ordered, which keeps the copies primary key
// index append-friendly and preserves created-order tiebreaks.

/**
 * Generates a UUIDv7: 48-bit unix-millisecond timestamp, then version and
 * variant bits over crypto-strength randomness (RFC 9562).
 *
 * @returns A lowercase hyphenated UUID string.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Per-byte via floor + modulo: bitwise operators coerce to 32-bit ints,
  // which would wrap for the upper timestamp bytes (Date.now() >= 2^40).
  const timestamp = Date.now();
  bytes[0] = Math.floor(timestamp / 2 ** 40) % 256;
  bytes[1] = Math.floor(timestamp / 2 ** 32) % 256;
  bytes[2] = Math.floor(timestamp / 2 ** 24) % 256;
  bytes[3] = Math.floor(timestamp / 2 ** 16) % 256;
  bytes[4] = Math.floor(timestamp / 2 ** 8) % 256;
  bytes[5] = timestamp % 256;

  // Version 7 in the high nibble of byte 6, RFC variant (10xx) in byte 8.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
