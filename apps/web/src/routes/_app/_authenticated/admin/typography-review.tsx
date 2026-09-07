import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { typographyReviewQueryOptions } from "@/features/admin/hooks/use-typography-review";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/typography-review")({
  head: () => adminSeoHead("Typography"),
  loader: ({ context }) =>
    context.queryClient.query({ ...typographyReviewQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
