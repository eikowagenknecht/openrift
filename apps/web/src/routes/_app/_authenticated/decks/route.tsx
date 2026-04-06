import { createFileRoute, Outlet } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";

export const Route = createFileRoute("/_app/_authenticated/decks")({
  component: DecksLayout,
  errorComponent: RouteErrorFallback,
});

function DecksLayout() {
  return (
    <div className="flex min-h-[calc(100vh-var(--header-height))] flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
