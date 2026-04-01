import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";

export const Route = createFileRoute("/_app/_authenticated/decks")({
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "decks")) {
      throw redirect({ to: "/cards" });
    }
  },
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
