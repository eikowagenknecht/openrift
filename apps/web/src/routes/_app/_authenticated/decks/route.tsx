import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";

export const Route = createFileRoute("/_app/_authenticated/decks")({
  errorComponent: RouteErrorFallback,
});
