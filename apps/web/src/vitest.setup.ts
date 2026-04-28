// oxlint-disable-next-line import/no-unassigned-import -- side-effect import that registers jest-dom matchers
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom doesn't implement ResizeObserver; components that observe layout
// (CardBrowserLayout, page-top-bar, etc.) rely on it. A no-op stub is enough
// for unit tests that don't actually measure layout.
if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver = class {
    observe(_target: Element): void {
      void _target;
    }
    unobserve(_target: Element): void {
      void _target;
    }
    disconnect(): void {
      // no-op
    }
  };
}

afterEach(() => {
  cleanup();
});
