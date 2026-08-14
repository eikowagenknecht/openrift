import { isUniqueViolation, isUniqueViolationOn } from "./pg-errors.js";

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

/**
 * Runs a token-consuming write, regenerating the token and retrying when the
 * write fails on a unique-constraint violation. At ~71 bits a collision is
 * astronomically unlikely, but tokens are UNIQUE-constrained, so without this
 * the once-in-forever collision would surface as a raw 500 instead of a
 * transparent retry. Non-unique-violation errors propagate immediately.
 *
 * Pass `constraint` when the callback writes more than the token-bearing row:
 * without it any 23505 the write raises — a duplicate satellite row, say —
 * burns all three attempts and then surfaces as a token problem.
 *
 * @param attempt The write, given a freshly minted token.
 * @param options.constraint The token's unique constraint, when the callback can
 *   raise 23505 from more than one index.
 * @returns Whatever the callback returns on its first successful attempt.
 */
export async function withUniqueShareToken<Result>(
  attempt: (token: string) => Promise<Result>,
  options?: { constraint?: string },
): Promise<Result> {
  const MAX_ATTEMPTS = 3;
  const constraint = options?.constraint;
  for (let tries = 1; ; tries++) {
    try {
      return await attempt(generateShareToken());
    } catch (error) {
      const collided =
        constraint === undefined
          ? isUniqueViolation(error)
          : isUniqueViolationOn(error, constraint);
      if (tries >= MAX_ATTEMPTS || !collided) {
        throw error;
      }
    }
  }
}
