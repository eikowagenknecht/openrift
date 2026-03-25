import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { allCardsQueryOptions, candidateListQueryOptions } from "@/hooks/use-candidates";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";

export const Route = createFileRoute("/_app/_authenticated/admin/cards")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(candidateListQueryOptions),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions),
      context.queryClient.ensureQueryData(allCardsQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
