import {
  META_CATALOG_DISPLAY_STATUSES,
  META_CATALOG_PROVIDERS,
  META_CATALOG_SORT_DIRECTIONS,
  META_CATALOG_SORTS,
  META_CATALOG_TRIAGE,
  META_EVENT_SORT_DIRECTIONS,
  META_EVENT_SORTS,
} from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminMetaEventsQueryOptions, metaEventsParamsFromSearch } from "@/hooks/use-admin-meta";
import { adminMetaCandidatesQueryOptions } from "@/hooks/use-admin-meta-candidates";
import { initQueryOptions } from "@/hooks/use-init";
import { adminSeoHead } from "@/lib/seo";

/**
 * The Meta Archive's URL state: which tab is open, and the catalogue table's
 * whole filter set. Every filter is absent at its default, so an untouched tab
 * carries a clean URL and the overview's funnel links stay short.
 */
export const metaSearchSchema = z.object({
  // Absent means the overview; every other tab is the opt-in one.
  tab: z.enum(["catalogue", "review", "public"]).optional(),
  // Which source the Sync and Catalogue tabs are showing. Absent is uvsgames.
  source: z.enum(META_CATALOG_PROVIDERS).optional(),
  page: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
  // Absent is the new queue, which is where triage starts. "any" is the reader
  // asking for no triage filter at all, which no default can stand in for.
  triage: z.union([z.enum(META_CATALOG_TRIAGE), z.literal("any")]).optional(),
  // Prefixed because a search param name is shared across the whole route tree:
  // plain `sort` belongs to the card browser's own vocabulary and plain `status`
  // to the admin cards tab, and a name carrying two value sets fails to compile
  // wherever a route spreads the previous search.
  eventStatus: z.enum(META_CATALOG_DISPLAY_STATUSES).optional(),
  eventSort: z.enum(META_CATALOG_SORTS).optional(),
  eventDir: z.enum(META_CATALOG_SORT_DIRECTIONS).optional(),
  minPlayers: z.coerce.number().int().min(0).optional(),
  decklists: z.boolean().optional(),
  missing: z.boolean().optional(),
  awaitingResults: z.boolean().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  // The Public tab's own filters. Prefixed for the same reason as `eventStatus`
  // above: these names live in the same URL as the catalogue's, and the two
  // tables filter different things.
  liveFormat: z.string().optional(),
  liveSort: z.enum(META_EVENT_SORTS).optional(),
  liveDir: z.enum(META_EVENT_SORT_DIRECTIONS).optional(),
  incompleteStandings: z.boolean().optional(),
  noDecks: z.boolean().optional(),
});

export type MetaSearch = z.infer<typeof metaSearchSchema>;

export const Route = createFileRoute("/_app/_authenticated/admin/meta")({
  head: () => adminSeoHead("Meta Archive"),
  validateSearch: metaSearchSchema,
  // Only the params the Public tab's query key reads. Names shared with the
  // catalogue (q, the dates) still re-run the loader off that tab, where the
  // warm resolves to a cache hit.
  loaderDeps: ({ search }) => ({
    tab: search.tab,
    page: search.page,
    q: search.q,
    liveFormat: search.liveFormat,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
    incompleteStandings: search.incompleteStandings,
    noDecks: search.noDecks,
    liveSort: search.liveSort,
    liveDir: search.liveDir,
  }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      // Warm the exact key the Public tab will read: its own filtered page on a
      // deep link, else the default first page the tab opens on. Anything less
      // exact misses the component's cache lookup and the tab suspends.
      context.queryClient.ensureQueryData(
        adminMetaEventsQueryOptions(metaEventsParamsFromSearch(deps.tab === "public" ? deps : {})),
      ),
      // The Candidates tab label carries the pending count, so the queue is
      // needed on both tabs.
      context.queryClient.ensureQueryData(adminMetaCandidatesQueryOptions),
      // The tables render format labels from /init.
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
