import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import {
  adminCustomTagCategoriesQueryOptions,
  adminCustomTagsQueryOptions,
} from "@/hooks/use-custom-tags";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/custom-tags")({
  head: () => adminSeoHead("Custom Tags"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminCustomTagsQueryOptions),
      context.queryClient.ensureQueryData(adminCustomTagCategoriesQueryOptions),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
