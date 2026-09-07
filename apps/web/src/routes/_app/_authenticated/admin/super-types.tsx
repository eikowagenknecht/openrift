import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminSuperTypesQueryOptions } from "@/hooks/use-super-types";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/super-types")({
  head: () => adminSeoHead("Supertypes"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminSuperTypesQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
