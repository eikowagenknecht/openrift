import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";

// Layout for /tournaments/run: renders the default <Outlet/> so the index and
// the $id detail are siblings, not parent/child.
export const Route = createFileRoute("/_app/_authenticated/tournaments_/run")({
  errorComponent: RouteErrorFallback,
});
