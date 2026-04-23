import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import { preventIOSOverscroll } from "./lib/ios-overscroll-prevention";

if (import.meta.env.DEV && !import.meta.env.VITE_DISABLE_DEVTOOLS) {
  const { scan } = await import("react-scan");
  scan({ enabled: true });
}

// Sentry client init happens inside getRouter() in router.ts, gated on !isServer.
// That lets Sentry.tanstackRouterBrowserTracingIntegration() receive the router
// instance, which is needed for route-named transactions and navigation spans.
preventIOSOverscroll();

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
);
