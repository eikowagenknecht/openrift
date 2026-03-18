import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";

import { ErrorBoundary } from "./components/error-fallback";
import { createAppRouter } from "./router";

// oxlint-disable-next-line import/no-unassigned-import -- CSS side-effect import
import "./index.css";

// Prevent iOS overscroll bounce / pull-to-refresh in PWA standalone mode.
// CSS overscroll-behavior-y: none doesn't fully suppress the gesture on iOS Safari.
{
  let startY = 0;
  document.addEventListener(
    "touchstart",
    (e) => {
      startY = e.touches[0].clientY;
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      // Don't interfere when body scroll is locked (e.g. card detail overlay).
      if (document.body.style.overflow === "hidden") {
        return;
      }
      if (e.touches[0].clientY > startY && globalThis.scrollY <= 0) {
        e.preventDefault();
      }
    },
    { passive: false },
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      onError: (err) => toast.error(err.message),
    },
  },
});

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
