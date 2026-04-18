import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { setsQueryOptions } from "@/hooks/use-sets";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/sets")({
  staticData: { title: "Sets" },
  head: () => adminSeoHead("Sets"),
  loader: ({ context }) => context.queryClient.ensureQueryData(setsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
