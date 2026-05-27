// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash } from "node:crypto";

/**
 * SHA-256 hash of a normalised email, used as the public identifier in a
 * Gravatar URL (`https://gravatar.com/avatar/{hash}`). Matches the algorithm
 * the client uses, so a server-computed hash and a client-computed hash
 * from the same email are byte-equal.
 *
 * @returns Lowercase hex digest of the email after trimming and lowercasing.
 */
export function gravatarHashForEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
