import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { ruleVersionsQueryOptions } from "@/hooks/use-rules";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/rules")({
  staticData: { title: "Rules" },
  head: () => adminSeoHead("Rules"),
  loader: ({ context }) => context.queryClient.ensureQueryData(ruleVersionsQueryOptions()),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
