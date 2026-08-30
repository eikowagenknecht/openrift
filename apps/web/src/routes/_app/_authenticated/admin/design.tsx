import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/design")({
  head: () => adminSeoHead("Design"),
  // The scope-bar demo derives its eras from the set list.
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSetListQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
