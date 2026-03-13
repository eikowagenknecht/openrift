import { useSyncExternalStore } from "react";

const STORAGE_KEY = "openrift:favorite-sources";

function getSnapshot(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return new Set(JSON.parse(raw) as string[]);
    }
  } catch {
    // ignore
  }
  return new Set();
}

let cached = getSnapshot();

// oxlint-disable-next-line prefer-await-to-callbacks -- useSyncExternalStore requires a subscribe callback
function subscribe(onStoreChange: () => void) {
  function onStorage(e: StorageEvent) {
    if (e.key === STORAGE_KEY) {
      cached = getSnapshot();
      onStoreChange();
    }
  }
  globalThis.addEventListener("storage", onStorage);
  return () => globalThis.removeEventListener("storage", onStorage);
}

function snap() {
  return cached;
}

function toggleFavorite(source: string) {
  const next = new Set(cached);
  if (next.has(source)) {
    next.delete(source);
  } else {
    next.add(source);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  cached = next;
  // Force re-render across all subscribers
  globalThis.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
}

export function useFavoriteSources() {
  const favorites = useSyncExternalStore(subscribe, snap, snap);

  return { favorites, toggleFavorite };
}
