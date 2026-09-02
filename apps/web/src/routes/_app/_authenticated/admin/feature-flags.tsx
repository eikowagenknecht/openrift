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
  head: () => adminSeoHead("Feature Flags"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...adminFeatureFlagsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminFeatureFlagOverridesQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminUsersQueryOptions, staleTime: "static" }),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
