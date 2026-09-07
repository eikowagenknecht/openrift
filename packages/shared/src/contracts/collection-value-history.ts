import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

const CSV_MAX_CHARS = 2000;

const CSV_MAX_ITEMS = 200;

// Without this a non-UUID element reaches the repo's `sql`${id}::uuid``
// interpolation and Postgres throws a 500 with a dev-mode SQL leak.
const csvUuidList = z
  .string()
  .min(1)
  .max(CSV_MAX_CHARS)
  .refine(
    (value) => {
      const ids = value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      return (
        ids.length > 0 &&
        ids.length <= CSV_MAX_ITEMS &&
        ids.every((id) => z.uuid().safeParse(id).success)
      );
    },
    { message: `must be a comma-separated list of at most ${CSV_MAX_ITEMS} UUIDs` },
  );

const csvBounded = z.string().min(1).max(CSV_MAX_CHARS);

export const collectionValueHistoryQuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]).default("tcgplayer"),
  collectionIds: csvUuidList.optional(),
  sets: csvBounded.optional(),
  languages: csvBounded.optional(),
  domains: csvBounded.optional(),
  types: csvBounded.optional(),
  rarities: csvBounded.optional(),
  finishes: csvBounded.optional(),
  artVariants: csvBounded.optional(),
  keywords: csvBounded.optional(),
  tags: csvBounded.optional(),
  customTags: csvBounded.optional(),
  cardSizes: csvBounded.optional(),
  standard: z.enum(["true", "false"]).optional(),
  keywordsPresence: z.enum(["any", "none"]).optional(),
  tagsPresence: z.enum(["any", "none"]).optional(),
  customTagsPresence: z.enum(["any", "none"]).optional(),
  setsExclude: csvBounded.optional(),
  languagesExclude: csvBounded.optional(),
  domainsExclude: csvBounded.optional(),
  typesExclude: csvBounded.optional(),
  raritiesExclude: csvBounded.optional(),
  finishesExclude: csvBounded.optional(),
  artVariantsExclude: csvBounded.optional(),
  keywordsExclude: csvBounded.optional(),
  tagsExclude: csvBounded.optional(),
  customTagsExclude: csvBounded.optional(),
  promos: z.enum(["only", "exclude"]).optional(),
  signed: z.enum(["true", "false"]).optional(),
  banned: z.enum(["true", "false"]).optional(),
  errata: z.enum(["true", "false"]).optional(),
});

export const collectionValueHistoryResponseSchema = z
  .object({
    series: z.array(
      z.object({
        date: z.string().openapi({ example: "2026-03-15" }),
        valueCents: z.number().int().openapi({ example: 125_000, description: "Integer cents" }),
        baselineValueCents: z.number().int().openapi({
          example: 118_000,
          description:
            "Integer cents. The same day's holdings valued at the prices in effect on the first day of the requested range, so the gap to valueCents is price movement alone.",
        }),
        copyCount: z.number().openapi({ example: 42 }),
      }),
    ),
  })
  .openapi("CollectionValueHistoryResponse");

export const collectionValueHistoryContract = {
  get: authedRoute
    .route({
      method: "GET",
      path: "/api/v1/collection-value-history",
      tags: ["Collection Value History"],
    })
    .input(collectionValueHistoryQuerySchema)
    .output(collectionValueHistoryResponseSchema),
};

export type CollectionValueHistoryContract = typeof collectionValueHistoryContract;
