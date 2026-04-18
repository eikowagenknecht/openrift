import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { typographyReviewQueryOptions } from "@/hooks/use-typography-review";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/typography-review")({
  staticData: { title: "Typography" },
  head: () => adminSeoHead("Typography"),
  loader: ({ context }) => context.queryClient.ensureQueryData(typographyReviewQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
