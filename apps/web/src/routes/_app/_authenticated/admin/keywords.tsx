import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { keywordStatsQueryOptions } from "@/hooks/use-keywords";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/keywords")({
  head: () => adminSeoHead("Keywords"),
  loader: ({ context }) =>
    context.queryClient.query({ ...keywordStatsQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
