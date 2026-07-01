import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
  catalogSetResponseSchema,
  imageIdSchema,
} from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const setListEntrySchema = catalogSetResponseSchema.extend({
  cardCount: z.number().openapi({ example: 312 }),
  printingCount: z.number().openapi({ example: 468 }),
  coverImageId: imageIdSchema.nullable(),
});

export const setListResponseSchema = z
  .object({ sets: z.array(setListEntrySchema) })
  .openapi("SetListResponse");

export const setDetailResponseSchema = z
  .object({
    set: catalogSetResponseSchema,
    cards: z.record(z.string(), catalogCardResponseSchema),
    printings: z.array(catalogPrintingResponseSchema),
    // prices are NOT inlined — read them from the /prices resource.
  })
  .openapi("SetDetailResponse");

const setSlugParamSchema = z.object({ setSlug: z.string().min(1) });

/**
 * oRPC contract for the public sets endpoints.
 *
 * `GET /api/v1/sets` — all sets with card/printing counts.
 * `GET /api/v1/sets/{setSlug}` — a set with its cards and printings, or a typed
 * `NOT_FOUND` error for an unknown slug. The error is declared on the contract
 * so both the handler (`errors.NOT_FOUND(...)`) and the web client
 * (`isDefinedError` / `err.code === "NOT_FOUND"`) are statically aware of it.
 */
export const setsContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/sets", tags: ["Sets"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .output(setListResponseSchema),
  detail: oc
    .route({ method: "GET", path: "/api/v1/sets/{setSlug}", tags: ["Sets"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .input(setSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Set not found" } })
    .output(setDetailResponseSchema),
};

export type SetsContract = typeof setsContract;
