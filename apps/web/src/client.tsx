import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import { preventIOSOverscroll } from "./lib/ios-overscroll-prevention";
import { initSentry } from "./lib/sentry";

// oxlint-disable-next-line import/no-unassigned-import -- CSS side-effect import
import "./index.css";

initSentry();
preventIOSOverscroll();

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
);
