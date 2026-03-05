import { useSyncExternalStore } from "react";

// oxlint-disable-next-line promise/prefer-await-to-callbacks -- required by useSyncExternalStore API
function subscribe(callback: () => void) {
  globalThis.addEventListener("online", callback);
  globalThis.addEventListener("offline", callback);
  return () => {
    globalThis.removeEventListener("online", callback);
    globalThis.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
