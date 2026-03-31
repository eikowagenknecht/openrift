import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { typographyReviewQueryOptions } from "@/hooks/use-typography-review";

export const Route = createFileRoute("/_app/_authenticated/admin/typography-review")({
  loader: ({ context }) => context.queryClient.ensureQueryData(typographyReviewQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
