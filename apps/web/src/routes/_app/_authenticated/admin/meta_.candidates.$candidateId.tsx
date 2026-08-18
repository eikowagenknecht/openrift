import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminMetaEventsQueryOptions } from "@/hooks/use-admin-meta";
import { adminMetaCandidateQueryOptions } from "@/hooks/use-admin-meta-candidates";
import { initQueryOptions } from "@/hooks/use-init";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/meta_/candidates/$candidateId")({
  head: () => adminSeoHead("Meta Archive Candidate"),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(adminMetaCandidateQueryOptions(params.candidateId)),
      context.queryClient.ensureQueryData(initQueryOptions),
      // The compare grid's Active column is the live event's own row, which the
      // detail response does not carry — it comes from the admin event list.
      context.queryClient.ensureQueryData(adminMetaEventsQueryOptions),
      // The unresolved-name picker searches the catalog, and it reads it with a
      // suspense query, so it has to be warm before the page mounts.
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
