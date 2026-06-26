import { oc } from "@orpc/contract";
import { z } from "zod";

import { rulesListResponseSchema, ruleVersionsListResponseSchema } from "../response-schemas.js";

const ruleKindEnum = z.enum(["core", "tournament"]);

/**
 * oRPC contract for the public rules endpoints.
 *
 * `GET /api/v1/rules?kind&version` — rules for a kind, at a version (or latest).
 * `GET /api/v1/rules/versions?kind` — the list of available versions.
 *
 * The input fields map to query parameters (the paths carry no params); an
 * invalid `kind` is an oRPC-native 400.
 */
export const rulesContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/rules", tags: ["Rules"] })
    .meta({ auth: "public" })
    .input(z.object({ kind: ruleKindEnum, version: z.string().optional() }))
    .output(rulesListResponseSchema),
  versions: oc
    .route({ method: "GET", path: "/api/v1/rules/versions", tags: ["Rules"] })
    .meta({ auth: "public" })
    .input(z.object({ kind: ruleKindEnum.optional() }))
    .output(ruleVersionsListResponseSchema),
};

export type RulesContract = typeof rulesContract;
