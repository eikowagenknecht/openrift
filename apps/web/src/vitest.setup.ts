// oxlint-disable-next-line import/no-unassigned-import -- side-effect import that registers jest-dom matchers
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom doesn't implement ResizeObserver; components that observe layout
// (CardBrowserLayout, page-top-bar, etc.) rely on it. A no-op stub is enough
// for unit tests that don't actually measure layout.
globalThis.ResizeObserver ??= class {
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

// jsdom doesn't implement Element.scrollIntoView — the rules anchor handler
// calls it after revealing a hidden rule.
if (globalThis.Element && !globalThis.Element.prototype.scrollIntoView) {
  globalThis.Element.prototype.scrollIntoView = () => {
    // no-op
  };
}

// jsdom doesn't implement Element.getAnimations — BaseUI's ScrollArea viewport
// polls it on a teardown timer and throws as an uncaught exception otherwise.
if (
  globalThis.Element &&
  (globalThis.Element.prototype as { getAnimations?: () => unknown[] }).getAnimations === undefined
) {
  (globalThis.Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];
}

// jsdom doesn't implement Document.elementFromPoint — input-otp (the six-digit
// code field) polls it on a timer and throws as an uncaught exception otherwise.
interface PartialElementFromPoint {
  elementFromPoint?: (x: number, y: number) => Element | null;
}

if (
  globalThis.Document &&
  (globalThis.Document.prototype as PartialElementFromPoint).elementFromPoint === undefined
) {
  (globalThis.Document.prototype as PartialElementFromPoint).elementFromPoint = () => null;
}

afterEach(() => {
  cleanup();
});
