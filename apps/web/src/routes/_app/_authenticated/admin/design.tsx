import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/design")({
  head: () => adminSeoHead("Design"),
  loader: ({ context }) =>
    context.queryClient.query({ ...publicSetListQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
