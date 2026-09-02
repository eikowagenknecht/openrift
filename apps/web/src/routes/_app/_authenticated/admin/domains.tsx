import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminDomainsQueryOptions } from "@/hooks/use-domains";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/domains")({
  head: () => adminSeoHead("Domains"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminDomainsQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
