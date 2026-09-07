import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { ruleVersionsQueryOptions } from "@/features/rules/hooks/use-rules";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/rules")({
  head: () => adminSeoHead("Rules"),
  loader: ({ context }) =>
    context.queryClient.query({ ...ruleVersionsQueryOptions(), staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
