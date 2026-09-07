// `-z-10` relies on `isolate` on the root layout div in __root.tsx; without
// that stacking context this paints behind the div's opaque bg-background.
export function AppBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ backgroundImage: "var(--app-gradient)" }}
      aria-hidden="true"
    />
  );
}
