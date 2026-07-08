/**
 * Ambient gradient behind every app-shell page — a dimmed variant of the
 * landing page's hero gradient (`--app-gradient` in index.css). The layer is
 * viewport-fixed so the radial washes stay viewport-sized on arbitrarily tall
 * virtualized pages and never repaint on scroll. `-z-10` relies on the
 * `isolate` on the root layout div in __root.tsx: without that stacking
 * context, the layer would paint behind the div's opaque `bg-background`.
 *
 * @returns The fixed background layer.
 */
export function AppBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ backgroundImage: "var(--app-gradient)" }}
      aria-hidden="true"
    />
  );
}
