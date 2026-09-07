import { useEffect, useState } from "react";

async function sha256Hex(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `?d=404` makes a missing avatar surface as an `error` status the Avatar component falls through on. */
export function gravatarUrlFromHash(hash: string, size = 80): string {
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

/** Use only when the caller already owns the email; other users get a server-computed hash instead. */
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
