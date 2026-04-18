import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { ignoredCandidatesQueryOptions } from "@/hooks/use-ignored-candidates";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/ignored-sources")({
  staticData: { title: "Ignored Sources" },
  head: () => adminSeoHead("Ignored Sources"),
  loader: ({ context }) => context.queryClient.ensureQueryData(ignoredCandidatesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
