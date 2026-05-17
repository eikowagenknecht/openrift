const SHARE_TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SHARE_TOKEN_LENGTH = 12;

/**
 * Generates an unguessable base62 share token. 12 chars × log2(62) ≈ 71 bits
 * of entropy. Unbiased via rejection sampling: we only accept bytes below the
 * largest multiple of 62 that fits in a byte (248).
 * @returns A 12-character base62 token.
 */
export function generateShareToken(): string {
  const threshold = Math.floor(256 / SHARE_TOKEN_ALPHABET.length) * SHARE_TOKEN_ALPHABET.length;
  const out: string[] = [];
  const buf = new Uint8Array(SHARE_TOKEN_LENGTH * 2);
  while (out.length < SHARE_TOKEN_LENGTH) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte < threshold) {
        out.push(SHARE_TOKEN_ALPHABET[byte % SHARE_TOKEN_ALPHABET.length]);
        if (out.length === SHARE_TOKEN_LENGTH) {
          break;
        }
      }
    }
  }
  return out.join("");
}
