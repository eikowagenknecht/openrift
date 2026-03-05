import { useEffect, useState } from "react";

async function sha256Hex(str: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function useGravatarUrl(email: string | undefined, size = 80): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!email) {
      return;
    }
    let cancelled = false;
    (async () => {
      const hash = await sha256Hex(email.trim().toLowerCase());
      if (!cancelled) {
        setUrl(`https://gravatar.com/avatar/${hash}?s=${size}&d=404`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, size]);

  return url;
}
