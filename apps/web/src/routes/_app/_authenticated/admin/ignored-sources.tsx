import { createFileRoute } from "@tanstack/react-router";

import { AdminError, AdminPending } from "@/components/admin/admin-route-components";
import { ignoredCandidatesQueryOptions } from "@/hooks/use-ignored-candidates";

export const Route = createFileRoute("/_app/_authenticated/admin/ignored-sources")({
  loader: ({ context }) => context.queryClient.ensureQueryData(ignoredCandidatesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
