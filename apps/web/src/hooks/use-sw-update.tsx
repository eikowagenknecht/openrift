import { createContext, useContext, useRef } from "react";
import type { ReactNode } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// Poll for SW updates every 60 s so iOS picks up new deploys without
// requiring the user to fully close and reopen the app twice.
const UPDATE_INTERVAL_MS = 60_000;

interface SWUpdateContextValue {
  needRefresh: boolean;
  dismiss: () => void;
  applyUpdate: () => Promise<void>;
  checkForUpdate: () => Promise<void>;
}

const SWUpdateContext = createContext<SWUpdateContextValue | null>(null);

export function SWUpdateProvider({ children }: { children: ReactNode }) {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      registrationRef.current = registration;
      if (!registration) {
        return;
      }
      setInterval(() => {
        void registration.update();
      }, UPDATE_INTERVAL_MS);
    },
  });

  const checkForUpdate = async () => {
    await registrationRef.current?.update();
  };

  return (
    <SWUpdateContext.Provider
      value={{
        needRefresh,
        dismiss: () => setNeedRefresh(false),
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
