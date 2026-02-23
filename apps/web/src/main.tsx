import { NuqsAdapter } from "nuqs/adapters/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";

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
      if (e.touches[0].clientY > startY && window.scrollY <= 0) {
        e.preventDefault();
      }
    },
    { passive: false },
  );
}

const root = document.querySelector<HTMLElement>("#root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <NuqsAdapter>
      <App />
    </NuqsAdapter>
  </StrictMode>,
);
