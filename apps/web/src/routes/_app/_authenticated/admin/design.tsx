import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { publicSetListQueryOptions } from "@/features/cards/hooks/use-public-sets";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/design")({
  head: () => adminSeoHead("Design"),
  loader: ({ context }) =>
    context.queryClient.query({ ...publicSetListQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
