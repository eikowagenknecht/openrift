import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminFinishesQueryOptions } from "@/hooks/use-finishes";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/finishes")({
  head: () => adminSeoHead("Finishes"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminFinishesQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
