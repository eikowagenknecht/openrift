import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { ignoredCandidatesQueryOptions } from "@/features/admin/hooks/use-ignored-candidates";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/ignored-sources")({
  head: () => adminSeoHead("Ignored Sources"),
  loader: ({ context }) =>
    context.queryClient.query({ ...ignoredCandidatesQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
