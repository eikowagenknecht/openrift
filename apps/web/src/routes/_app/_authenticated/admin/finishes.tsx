import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminFinishesQueryOptions } from "@/hooks/use-finishes";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/finishes")({
  staticData: { title: "Finishes" },
  head: () => adminSeoHead("Finishes"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminFinishesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
