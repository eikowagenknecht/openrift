import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import {
  adminMetaEventsQueryOptions,
  metaEventsParamsFromSearch,
} from "@/features/admin/hooks/use-admin-meta";
import { adminMetaOverlaysQueryOptions } from "@/features/admin/hooks/use-admin-meta-overlays";
import { metaSearchSchema } from "@/features/admin/lib/admin-meta-search";
import { initQueryOptions } from "@/hooks/use-init";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/meta")({
  head: () => adminSeoHead("Meta Archive"),
  validateSearch: metaSearchSchema,
  loaderDeps: ({ search }) => ({
    tab: search.tab,
    page: search.page,
    q: search.q,
    liveFormat: search.liveFormat,
    liveSource: search.liveSource,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
    incompleteStandings: search.incompleteStandings,
    noDecks: search.noDecks,
    liveSort: search.liveSort,
    liveDir: search.liveDir,
  }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      // Warm the exact key the Public tab will read, or the tab suspends on
      // a cache miss.
      context.queryClient.query({
        ...adminMetaEventsQueryOptions(
          metaEventsParamsFromSearch(deps.tab === "public" ? deps : {}),
        ),
        staleTime: "static",
      }),
      // The Candidates tab label carries the pending count, so the queue is
      // needed on both tabs.
      context.queryClient.query({ ...adminMetaOverlaysQueryOptions, staleTime: "static" }),
      // The tables render format labels from /init.
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
