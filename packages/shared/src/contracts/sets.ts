import { oc } from "@orpc/contract";
import { z } from "zod";

import { setDetailResponseSchema, setListResponseSchema } from "../response-schemas.js";

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
    .meta({ auth: "public" })
    .output(setListResponseSchema),
  detail: oc
    .route({ method: "GET", path: "/api/v1/sets/{setSlug}", tags: ["Sets"] })
    .meta({ auth: "public" })
    .input(setSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Set not found" } })
    .output(setDetailResponseSchema),
};

export type SetsContract = typeof setsContract;
