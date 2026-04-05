import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ErrorBoundary } from "./components/error-fallback";
import { preventIOSOverscroll } from "./lib/ios-overscroll-prevention";
import { createQueryClient } from "./lib/query-client";
import { initSentry } from "./lib/sentry";
import { createAppRouter } from "./router";

// oxlint-disable-next-line import/no-unassigned-import -- CSS side-effect import
import "./index.css";

initSentry();
preventIOSOverscroll();

const queryClient = createQueryClient();

const router = createAppRouter(queryClient);

const root = document.querySelector<HTMLElement>("#root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
