import { createFileRoute, Outlet } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";

export const Route = createFileRoute("/_app/_authenticated/decks")({
  component: DecksLayout,
  errorComponent: RouteErrorFallback,
});

function DecksLayout() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
