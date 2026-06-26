import * as contracts from "@openrift/shared/contracts";
import type { AnyContractRouter } from "@orpc/contract";
import type { OpenAPI } from "@orpc/openapi";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

// The oRPC OpenAPI document is generated from the shared contracts (the same
// values the routers implement), so every migrated endpoint appears in the spec
// without a second source of truth. Zod v4 schemas are converted by the zod4
// converter; schemas are inlined per-operation (no `components.schemas`), so
// there is no $ref-name collision with the legacy `@hono/zod-openapi` doc that
// still covers the handful of not-yet-migrated routes.

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

/**
 * Collects every `*Contract` runtime export from the shared contracts barrel
 * into a single router object. Keys are arbitrary (the OpenAPI path comes from
 * each procedure's `.route({ path })`), so the nesting is just for traversal.
 * @returns A router object whose leaves are the contract procedures.
 */
function buildContractRouter(): AnyContractRouter {
  const router: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(contracts)) {
    if (key.endsWith("Contract")) {
      router[key] = value;
    }
  }
  // The barrel's `*Contract` exports are all contract routers; the cast tells
  // the generator to treat the assembled object as one nested router.
  return router as AnyContractRouter;
}

// The contract spec is static for a given build, so generate it once and reuse
// the promise across requests to /api/doc and /api/admin/doc.
let cachedContractDoc: Promise<OpenAPI.Document> | null = null;

/**
 * Generates (once, then cached) the OpenAPI document for all migrated oRPC
 * endpoints from the shared contracts.
 * @returns The contract-derived OpenAPI document.
 */
export function generateContractOpenAPIDocument(): Promise<OpenAPI.Document> {
  cachedContractDoc ??= generator.generate(buildContractRouter());
  return cachedContractDoc;
}
