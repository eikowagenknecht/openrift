import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Rules";

const RULES = "/api/admin/v1/rules";

const ruleKindEnum = z.enum(["core", "tournament"]);

const versionParamSchema = z.object({ kind: ruleKindEnum, version: z.string() });

/**
 * oRPC contract for the admin rules management (mounted under
 * `/api/admin/v1/rules`, admin-gated by the mount): import a new version
 * (computing added/modified/removed diffs), delete a version, and edit a
 * version's comments. Distinct from the public `rules` read contract. Conflict
 * / bad-request / not-found states are thrown as `AppError` and bridged to
 * ORPCErrors in the implementation.
 */
export const adminRulesContract = {
  import: oc
    .route({ method: "POST", path: `${RULES}/import`, tags: [TAG], successStatus: 201 })
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
  removeVersion: oc
    .route({
      method: "DELETE",
      path: `${RULES}/{kind}/versions/{version}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(versionParamSchema),
  updateVersion: oc
    .route({ method: "PATCH", path: `${RULES}/{kind}/versions/{version}`, tags: [TAG] })
    .input(versionParamSchema.extend({ comments: z.string().nullable() }))
    .output(z.object({ kind: ruleKindEnum, version: z.string(), comments: z.string().nullable() })),
};

export type AdminRulesContract = typeof adminRulesContract;
