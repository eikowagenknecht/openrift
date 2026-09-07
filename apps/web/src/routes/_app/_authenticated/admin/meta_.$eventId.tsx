import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import {
  adminMetaEventPlayersQueryOptions,
  adminMetaEventQueryOptions,
} from "@/features/admin/hooks/use-admin-meta";
import { catalogQueryOptions } from "@/features/cards/hooks/catalog-query";
import { initQueryOptions } from "@/hooks/use-init";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/meta_/$eventId")({
  head: () => adminSeoHead("Meta Archive Decks"),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({
        ...adminMetaEventPlayersQueryOptions(params.eventId),
        staleTime: "static",
      }),
      context.queryClient.query({
        ...adminMetaEventQueryOptions(params.eventId),
        staleTime: "static",
      }),
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
      // The add-deck form matches pasted lists against the catalog, so it has to
      // be warm before the dialog mounts — it reads it with a suspense query.
      context.queryClient.query({ ...catalogQueryOptions, staleTime: "static" }),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
