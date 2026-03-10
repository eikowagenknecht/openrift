import { createContext, useContext, useRef } from "react";
import type { ReactNode } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// Poll for SW updates every 60 s so iOS picks up new deploys without
// requiring the user to fully close and reopen the app twice.
const UPDATE_INTERVAL_MS = 60_000;

interface SWUpdateContextValue {
  /** Manually check for a new service worker. */
  checkForUpdate: () => Promise<void>;
}

const SWUpdateContext = createContext<SWUpdateContextValue | null>(null);

export function SWUpdateProvider({ children }: { children: ReactNode }) {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useRegisterSW({
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

  const checkForUpdate = async (): Promise<void> => {
    const reg = registrationRef.current;
    if (!reg) {
      return;
    }
    await reg.update();
  };

  return <SWUpdateContext.Provider value={{ checkForUpdate }}>{children}</SWUpdateContext.Provider>;
}

export function useSWUpdate(): SWUpdateContextValue {
  const ctx = useContext(SWUpdateContext);
  if (!ctx) {
    throw new Error("useSWUpdate must be used within <SWUpdateProvider>");
  }
  return ctx;
}
