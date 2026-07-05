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

/** @returns `true` if the error is a Postgres unique-constraint violation (23505). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Runs a token-consuming write, regenerating the token and retrying when the
 * write fails on a unique-constraint violation. At ~71 bits a collision is
 * astronomically unlikely, but tokens are UNIQUE-constrained, so without this
 * the once-in-forever collision would surface as a raw 500 instead of a
 * transparent retry. Non-unique-violation errors propagate immediately.
 * @returns Whatever the callback returns on its first successful attempt.
 */
export async function withUniqueShareToken<Result>(
  attempt: (token: string) => Promise<Result>,
): Promise<Result> {
  const MAX_ATTEMPTS = 3;
  for (let tries = 1; ; tries++) {
    try {
      return await attempt(generateShareToken());
    } catch (error) {
      if (tries >= MAX_ATTEMPTS || !isUniqueViolation(error)) {
        throw error;
      }
    }
  }
}
