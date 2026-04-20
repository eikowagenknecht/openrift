import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminSuperTypesQueryOptions } from "@/hooks/use-super-types";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/super-types")({
  staticData: { title: "Super Types" },
  head: () => adminSeoHead("Super Types"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminSuperTypesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
