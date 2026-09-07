import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { unmatchedCardDetailQueryOptions } from "@/features/admin/hooks/use-admin-card-queries";
import { providerSettingsQueryOptions } from "@/features/admin/hooks/use-provider-settings";
import { adminDistinctArtistsQueryOptions } from "@/features/cards/hooks/use-distinct-artists";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";
import { adminMarkersQueryOptions } from "@/hooks/use-markers";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/cards_/new/$name")({
  head: () => adminSeoHead("New Card"),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({
        ...unmatchedCardDetailQueryOptions(params.name),
        staleTime: "static",
      }),
      context.queryClient.query({ ...adminMarkersQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...providerSettingsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminDistinctArtistsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminLanguagesQueryOptions, staleTime: "static" }),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
