import { createFileRoute } from "@tanstack/react-router";

import { adminFeatureFlagsQueryOptions } from "@/hooks/use-feature-flags";

export const Route = createFileRoute("/_authenticated/admin/feature-flags")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminFeatureFlagsQueryOptions),
});
