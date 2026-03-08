import { createContext, useContext, useRef } from "react";
import type { ReactNode } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// Poll for SW updates every 60 s so iOS picks up new deploys without
// requiring the user to fully close and reopen the app twice.
const UPDATE_INTERVAL_MS = 60_000;

interface SWUpdateContextValue {
  needRefresh: boolean;
  applyUpdate: () => Promise<void>;
  /** Check for updates. Returns `true` if an update is available. */
  checkForUpdate: () => Promise<boolean>;
}

const SWUpdateContext = createContext<SWUpdateContextValue | null>(null);

export function SWUpdateProvider({ children }: { children: ReactNode }) {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      registrationRef.current = registration ?? null;
      if (!registration) {
        return;
      }
      setInterval(() => {
        void registration.update();
      }, UPDATE_INTERVAL_MS);
    },
  });

  const checkForUpdate = async (): Promise<boolean> => {
    const reg = registrationRef.current;
    if (!reg) {
      return false;
    }
    await reg.update();
    // A previously-dismissed update still has a waiting worker — resurface it.
    if (reg.waiting) {
      setNeedRefresh(true);
      return true;
    }
    return false;
  };

  return (
    <SWUpdateContext.Provider
      value={{
        needRefresh,
        applyUpdate: () => updateServiceWorker(true),
        checkForUpdate,
      }}
    >
      {children}
    </SWUpdateContext.Provider>
  );
}

export function useSWUpdate(): SWUpdateContextValue {
  const ctx = useContext(SWUpdateContext);
  if (!ctx) {
    throw new Error("useSWUpdate must be used within <SWUpdateProvider>");
  }
  return ctx;
}
