import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { keywordStatsQueryOptions } from "@/hooks/use-keywords";

export const Route = createFileRoute("/_app/_authenticated/admin/keywords")({
  staticData: { title: "Keywords" },
  loader: ({ context }) => context.queryClient.ensureQueryData(keywordStatsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
