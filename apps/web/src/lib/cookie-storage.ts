import type { StateStorage } from "zustand/middleware";
import { createJSONStorage } from "zustand/middleware";

const ONE_YEAR = 365 * 24 * 60 * 60;

function encodeName(name: string): string {
  return encodeURIComponent(name);
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const encoded = encodeName(name);
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${encoded}=`));
  if (!match) {
    return null;
  }
  return decodeURIComponent(match.split("=").slice(1).join("="));
}

function setCookie(name: string, value: string): void {
  if (typeof document === "undefined") {
    return;
  }
  const encoded = encodeName(name);
  document.cookie = `${encoded}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
}

function removeCookie(name: string): void {
  if (typeof document === "undefined") {
    return;
  }
  const encoded = encodeName(name);
  document.cookie = `${encoded}=; path=/; max-age=0`;
}

const rawStorage: StateStorage = {
  getItem: (name) => getCookie(name),
  setItem: (name, value) => setCookie(name, value),
  removeItem: (name) => removeCookie(name),
};

/**
 * Zustand persist storage backed by cookies instead of localStorage.
 * Allows the server to read preferences during SSR (no FOUC).
 *
 * Wrap with createJSONStorage so Zustand handles JSON
 * serialization/deserialization and the StorageValue envelope.
 */
export const cookieStorage = createJSONStorage(() => rawStorage);
