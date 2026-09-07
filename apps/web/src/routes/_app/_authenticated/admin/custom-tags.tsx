import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import {
  adminCustomTagCategoriesQueryOptions,
  adminCustomTagsQueryOptions,
} from "@/features/collections/hooks/use-custom-tags";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/custom-tags")({
  head: () => adminSeoHead("Custom Tags"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...adminCustomTagsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminCustomTagCategoriesQueryOptions, staleTime: "static" }),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
