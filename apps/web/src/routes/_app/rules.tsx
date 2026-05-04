import { createFileRoute, redirect } from "@tanstack/react-router";

import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";

export const Route = createFileRoute("/_app/rules")({
  loader: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "rules")) {
      throw redirect({ to: "/cards" });
    }
    throw redirect({ to: "/rules/$kind", params: { kind: "core" }, replace: true });
  },
});
