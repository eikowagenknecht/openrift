import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
  catalogSetResponseSchema,
} from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

// Wire-only shapes for /catalog: identity lives in the map key, not the value.
export const catalogCardResponseValueSchema = catalogCardResponseSchema.omit({ id: true });

export const catalogPrintingResponseValueSchema = catalogPrintingResponseSchema.omit({ id: true });

export const catalogResponseSchema = z
  .object({
    sets: z.array(catalogSetResponseSchema),
    cards: z.record(z.string(), catalogCardResponseValueSchema),
    printings: z.record(z.string(), catalogPrintingResponseValueSchema),
    totalCopies: z.number().openapi({ example: 142 }),
    /**
     * Map of card id → array of custom-tag slugs (sorted). Admin-curated
     * tags supplementing the catalogue's intrinsic data; consumed only by
     * custom deck-builder formats (e.g. region-locked freeform). Standard
     * UI should not render these alongside `card.tags`.
     */
    customTagAssignments: z.record(z.string(), z.array(z.string())).openapi({ example: {} }),
  })
  .openapi("CatalogResponse");

// A comma-joined list of language codes ("EN", "EN,FR"). Bounded so one request
// cannot build a pathologically large filter list. Codes are matched
// case-insensitively; unknown codes match nothing rather than erroring.
const LANGUAGE_CSV_MAX_CHARS = 200;

const languageCsv = z.string().min(1).max(LANGUAGE_CSV_MAX_CHARS).openapi({ example: "EN" });

const MUTUALLY_EXCLUSIVE_MESSAGE = "langs and exceptLangs are mutually exclusive";

export const catalogInputSchema = z
  .object({
    v: z.string().optional(),
    langs: languageCsv.optional(),
    exceptLangs: languageCsv.optional(),
  })
  .refine((input) => input.langs === undefined || input.exceptLangs === undefined, {
    message: MUTUALLY_EXCLUSIVE_MESSAGE,
    path: ["exceptLangs"],
  });

/**
 * oRPC contract for the public card catalog (`GET /api/v1/catalog`). The `v`
 * query param is a cache-buster the web appends (the catalog's current ETag) so
 * a content change rolls the edge-cache URL; the handler ignores it. Long-lived
 * edge cache + ETag are applied by the mount's Hono `etag()` middleware.
 *
 * `langs` and `exceptLangs` split that catalog by printing language, because
 * printings are 92% of a ~5MB payload and roughly two thirds of them are in
 * languages the first paint never shows. The client asks for its own languages
 * on the critical path and merges the rest in later:
 *
 * - `langs=EN,FR` returns the full core (sets, cards, totalCopies,
 *   customTagAssignments) with only the printings in those languages.
 * - `exceptLangs=EN,FR` returns the complement — the remaining printings, with
 *   `cards` and `customTagAssignments` emptied so the 380KB core is not sent
 *   twice. `sets` stays (3KB) so the tail response is self-contained.
 * - Neither param returns the whole catalog, byte-identical to a client that
 *   knows nothing about the split. That back-compat matters during deploy skew:
 *   a new client hitting an old API just gets the full catalog, and the
 *   client-side merge tolerates it.
 *
 * The two are mutually exclusive; sending both is a 400.
 */
export const catalogContract = {
  catalog: oc
    .route({ method: "GET", path: "/api/v1/catalog", tags: ["Catalog"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .input(catalogInputSchema)
    .output(catalogResponseSchema),
};

export type CatalogContract = typeof catalogContract;
