import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import { preventIOSOverscroll } from "./lib/ios-overscroll-prevention";
import { initSentry } from "./lib/sentry";

if (import.meta.env.DEV && !import.meta.env.VITE_DISABLE_DEVTOOLS) {
  const { scan } = await import("react-scan");
  scan({ enabled: true });
}

initSentry();
preventIOSOverscroll();

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
);
