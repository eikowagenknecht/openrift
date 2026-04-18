import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminDomainsQueryOptions } from "@/hooks/use-domains";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/domains")({
  staticData: { title: "Domains" },
  head: () => adminSeoHead("Domains"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminDomainsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
