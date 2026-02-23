import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// Poll for SW updates every 60 s so iOS picks up new deploys without
// requiring the user to fully close and reopen the app twice.
const UPDATE_INTERVAL_MS = 60_000;

interface SWUpdateContextValue {
  needRefresh: boolean;
  dismiss: () => void;
  applyUpdate: () => Promise<void>;
}

const SWUpdateContext = createContext<SWUpdateContextValue | null>(null);

export function SWUpdateProvider({ children }: { children: ReactNode }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (!registration) {
        return;
      }
      setInterval(() => {
        void registration.update();
      }, UPDATE_INTERVAL_MS);
    },
  });

  return (
    <SWUpdateContext.Provider
      value={{
        needRefresh,
        dismiss: () => setNeedRefresh(false),
        applyUpdate: () => updateServiceWorker(true),
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
