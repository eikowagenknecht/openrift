import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminFinishesQueryOptions } from "@/hooks/use-finishes";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/finishes")({
  head: () => adminSeoHead("Finishes"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminFinishesQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
