import {
  META_CATALOG_DISPLAY_STATUSES,
  META_CATALOG_PROVIDERS,
  META_CATALOG_SORT_DIRECTIONS,
  META_CATALOG_SORTS,
  META_CATALOG_TRIAGE,
  META_EVENT_SORT_DIRECTIONS,
  META_EVENT_SORTS,
  META_EVENT_SOURCE_FILTERS,
  PLAYLOLTCG_STATUSES,
} from "@openrift/shared";
import type { PlayloltcgStatus } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminMetaEventsQueryOptions, metaEventsParamsFromSearch } from "@/hooks/use-admin-meta";
import { adminMetaOverlaysQueryOptions } from "@/hooks/use-admin-meta-overlays";
import { initQueryOptions } from "@/hooks/use-init";
import { adminSeoHead } from "@/lib/seo";

/**
 * The Meta Archive's URL state: which tab is open, and the catalogue table's
 * whole filter set. Every filter is absent at its default, so an untouched tab
 * carries a clean URL and the overview's funnel links stay short.
 */
export const metaSearchSchema = z.object({
  tab: z.enum(["catalogue", "review", "public"]).optional(),
  source: z.enum(META_CATALOG_PROVIDERS).optional(),
  page: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
  triage: z.union([z.enum(META_CATALOG_TRIAGE), z.literal("any")]).optional(),
  eventStatus: z.enum(META_CATALOG_DISPLAY_STATUSES).optional(),
  plStatus: z.coerce
    .number()
    .int()
    .refine((value): value is PlayloltcgStatus =>
      PLAYLOLTCG_STATUSES.some((status) => status === value),
    )
    .optional(),
  tdFormat: z.string().optional(),
  eventSort: z.enum(META_CATALOG_SORTS).optional(),
  eventDir: z.enum(META_CATALOG_SORT_DIRECTIONS).optional(),
  minPlayers: z.coerce.number().int().min(0).optional(),
  decklists: z.boolean().optional(),
  missing: z.boolean().optional(),
  awaitingResults: z.boolean().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  liveFormat: z.string().optional(),
  liveSource: z.enum(META_EVENT_SOURCE_FILTERS).optional(),
  liveSort: z.enum(META_EVENT_SORTS).optional(),
  liveDir: z.enum(META_EVENT_SORT_DIRECTIONS).optional(),
  incompleteStandings: z.boolean().optional(),
  noDecks: z.boolean().optional(),
});

export type MetaSearch = z.infer<typeof metaSearchSchema>;

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
