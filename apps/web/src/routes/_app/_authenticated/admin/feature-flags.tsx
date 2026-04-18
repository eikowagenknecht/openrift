import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminUsersQueryOptions } from "@/hooks/use-admin-users";
import {
  adminFeatureFlagOverridesQueryOptions,
  adminFeatureFlagsQueryOptions,
} from "@/hooks/use-feature-flags";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/feature-flags")({
  staticData: { title: "Feature Flags" },
  head: () => adminSeoHead("Feature Flags"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminFeatureFlagsQueryOptions),
      context.queryClient.ensureQueryData(adminFeatureFlagOverridesQueryOptions),
      context.queryClient.ensureQueryData(adminUsersQueryOptions),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
