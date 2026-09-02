import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminCardTagsQueryOptions, adminTagCategoriesQueryOptions } from "@/hooks/use-card-tags";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/card-tags")({
  head: () => adminSeoHead("Card Tags"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...adminCardTagsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminTagCategoriesQueryOptions, staleTime: "static" }),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
