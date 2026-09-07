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
    customTagAssignments: z.record(z.string(), z.array(z.string())).openapi({ example: {} }),
  })
  .openapi("CatalogResponse");

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

export const catalogContract = {
  catalog: oc
    .route({ method: "GET", path: "/api/v1/catalog", tags: ["Catalog"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .input(catalogInputSchema)
    .output(catalogResponseSchema),
};

export type CatalogContract = typeof catalogContract;
