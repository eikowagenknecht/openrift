import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { deckFormatSchema, metaEventTierSchema } from "@openrift/shared/response-schemas";
import { isoDate } from "@openrift/shared/schemas";
import { z } from "zod";

import {
  META_EVENT_SORT_DIRECTIONS,
  META_EVENT_SORTS,
  META_EVENT_SOURCE_FILTERS,
} from "../../types/enums.js";

extendZodWithOpenApi(z);

/**
 * A slug here would be shadowed by `/meta`'s own static routes and never
 * reachable. Add a name whenever `/meta` gains a static child.
 */
export const RESERVED_META_EVENT_SLUGS = [
  "admin",
  "decks",
  "events",
  "legends",
  "new",
  "stats",
  "submissions",
  "submit",
];

export const eventSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{2,49}$/u, "Slug must be 3-50 lowercase letters, digits, or hyphens")
  .refine((slug) => !RESERVED_META_EVENT_SLUGS.includes(slug), {
    message: `Reserved slug. Pick another: ${RESERVED_META_EVENT_SLUGS.join(", ")} are taken`,
  });

const countrySchema = z
  .string()
  .regex(/^[A-Z]{2}$/u, "Country must be a two-letter ISO 3166-1 code, e.g. DE");

export const eventBodySchema = z.object({
  slug: eventSlugSchema,
  name: z.string().min(1).max(120),
  eventDate: isoDate,
  format: z.string().min(1),
  playerCount: z.number().int().positive().nullable().optional(),
  organizer: z.string().min(1).max(120).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  tier: metaEventTierSchema.optional(),
  country: countrySchema.nullable().optional(),
  location: z.string().min(1).max(500).nullable().optional(),
});

export const adminMetaEventSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    eventDate: isoDate,
    format: deckFormatSchema,
    playerCount: z.number().int().nullable(),
    organizer: z.string().nullable(),
    notes: z.string().nullable(),
    tier: metaEventTierSchema,
    country: z.string().nullable(),
    location: z.string().nullable(),
    playerRowCount: z.number().int().nonnegative(),
    deckCount: z.number().int().nonnegative(),
    sources: z.array(
      z.object({
        id: z.string(),
        provider: z.string().nullable(),
        externalId: z.string().nullable(),
        priority: z.number().int(),
      }),
    ),
  })
  .openapi("AdminMetaEvent");

export const adminMetaEventListQuerySchema = z.object({
  search: z.string().optional(),
  format: z.string().optional(),
  source: z.enum(META_EVENT_SOURCE_FILTERS).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  incompleteStandings: z.coerce.boolean().optional(),
  noDecks: z.coerce.boolean().optional(),
  sort: z.enum(META_EVENT_SORTS).optional(),
  direction: z.enum(META_EVENT_SORT_DIRECTIONS).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const adminMetaEventListResponseSchema = z
  .object({
    events: z.array(adminMetaEventSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int(),
    limit: z.number().int(),
  })
  .openapi("AdminMetaEventList");

/**
 * Mirrors the public event page's citation schema field for field: citations
 * are the credit line, not admin-only data.
 */
export const adminMetaEventSourceSchema = z
  .object({
    id: z.string(),
    provider: z.string().nullable(),
    externalId: z.string().nullable(),
    label: z.string(),
    sourceUrl: z.string().nullable(),
  })
  .openapi("AdminMetaEventSource");
