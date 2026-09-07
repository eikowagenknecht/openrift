import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import {
  adminCardTagsQueryOptions,
  adminTagCategoriesQueryOptions,
} from "@/features/cards/hooks/use-card-tags";
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
