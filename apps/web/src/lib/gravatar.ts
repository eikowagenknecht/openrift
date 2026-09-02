import { useEffect, useState } from "react";

async function sha256Hex(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Synchronous URL builder. Use when a hash is already known (server-supplied
 * or just computed by {@link useGravatarHash}). The `?d=404` query makes a
 * missing avatar surface as an `error` status the Avatar component can fall
 * through to the next tier.
 *
 * @returns A Gravatar URL ready to be set on an `<img>` element.
 */
export function gravatarUrlFromHash(hash: string, size = 80): string {
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

/**
 * Hashes an email on the client. Returns `undefined` until the first
 * SHA-256 microtask resolves. Use only when the caller already owns the
 * email (e.g. the signed-in user's own email); for other users, the
 * server sends a pre-computed hash.
 *
 * @returns The hex digest, or `undefined` until ready.
 */
export function useGravatarHash(email: string | undefined): string | undefined {
  const [hash, setHash] = useState<string>();

  useEffect(() => {
    if (!email) {
      return;
    }
    let cancelled = false;
    void (async () => {
      // A digest failure leaves the avatar on its initials fallback.
      const computed = await sha256Hex(email.trim().toLowerCase()).catch(() => null);
      if (computed !== null && !cancelled) {
        setHash(computed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  return hash;
}
