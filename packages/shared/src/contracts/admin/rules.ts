import { withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Rules";

const RULES = "/api/admin/v1/rules";

const ruleKindEnum = z.enum(["core", "tournament"]);

const versionParamSchema = z.object({ kind: ruleKindEnum, version: z.string() });

/**
 * oRPC contract for the admin rules management (mounted under
 * `/api/admin/v1/rules`, admin-gated by the mount): import a new version
 * (computing added/modified/removed diffs), delete a version, and edit a
 * version's comments. Distinct from the public `rules` read contract. All
 * procedures are session-gated (UNAUTHORIZED + FORBIDDEN from `authedRoute`).
 * Domain codes per route: `import` → CONFLICT (version already exists) +
 * BAD_REQUEST (empty content or out-of-order version); `removeVersion` →
 * NOT_FOUND; `updateVersion` → NOT_FOUND.
 */
export const adminRulesContract = {
  import: authedRoute
    .route({ method: "POST", path: `${RULES}/import`, tags: [TAG], successStatus: 201 })
    .errors({
      CONFLICT: { message: "Rules version already exists" },
      BAD_REQUEST: { message: "Invalid rules content or version order" },
    })
    .input(
      z.object({
        kind: ruleKindEnum,
        version: z.string().min(1),
        comments: z.string().nullable().optional(),
        content: z.string().min(1),
      }),
    )
    .output(
      z.object({
        kind: ruleKindEnum,
        version: z.string(),
        rulesCount: z.number(),
        added: z.number(),
        modified: z.number(),
        removed: z.number(),
      }),
    ),
  removeVersion: authedRoute
    .route({
      method: "DELETE",
      path: `${RULES}/{kind}/versions/{version}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Rules version not found" } })
    .input(versionParamSchema),
  updateVersion: authedRoute
    .route({ method: "PATCH", path: `${RULES}/{kind}/versions/{version}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Rules version not found" } })
    .input(withParams(versionParamSchema, { comments: z.string().nullable() }))
    .output(z.object({ kind: ruleKindEnum, version: z.string(), comments: z.string().nullable() })),
};

export type AdminRulesContract = typeof adminRulesContract;
