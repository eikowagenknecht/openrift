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
import { z } from "zod";

/**
 * Every filter is absent at its default, so an untouched tab carries a clean
 * URL and the overview's funnel links stay short.
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
