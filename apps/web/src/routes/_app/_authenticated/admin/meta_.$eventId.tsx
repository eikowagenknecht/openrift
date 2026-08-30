import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import {
  adminMetaEventPlayersQueryOptions,
  adminMetaEventQueryOptions,
} from "@/hooks/use-admin-meta";
import { initQueryOptions } from "@/hooks/use-init";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/meta_/$eventId")({
  head: () => adminSeoHead("Meta Archive Decks"),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(adminMetaEventPlayersQueryOptions(params.eventId)),
      context.queryClient.ensureQueryData(adminMetaEventQueryOptions(params.eventId)),
      context.queryClient.ensureQueryData(initQueryOptions),
      // The add-deck form matches pasted lists against the catalog, so it has to
      // be warm before the dialog mounts — it reads it with a suspense query.
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
