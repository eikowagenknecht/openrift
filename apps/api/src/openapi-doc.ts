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

type AuthLevel = "public" | "bearer" | undefined;

interface ContractDef {
  route?: { method?: string; path?: string };
  meta?: { auth?: AuthLevel };
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

/**
 * Walks the assembled contract router and records each operation's auth level
 * (from its `meta`) keyed by `"METHOD /path"`, so the generated document can
 * carry an accurate per-operation `security` marker.
 * @returns Nothing; fills `out`.
 */
function collectAuthByOperation(node: unknown, out: Map<string, AuthLevel>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const def = (node as { "~orpc"?: ContractDef })["~orpc"];
  if (def?.route?.method && def.route.path) {
    out.set(`${def.route.method} ${def.route.path}`, def.meta?.auth);
    return;
  }
  for (const value of Object.values(node)) {
    collectAuthByOperation(value, out);
  }
}

/**
 * Sets the OpenAPI `security` from each contract's auth level — the same `meta`
 * the runtime `requireUser` middleware reads — so Swagger UI shows which
 * endpoints need credentials: the document defaults to the session `cookieAuth`
 * (matching the fail-closed model), public reads opt out with `security: []`,
 * and the provider push declares its `bearerAuth` key.
 * @returns Nothing; mutates `doc` in place.
 */
function applySecurity(doc: OpenAPI.Document, router: AnyContractRouter): void {
  const authByOperation = new Map<string, AuthLevel>();
  collectAuthByOperation(router, authByOperation);
  doc.security = [{ cookieAuth: [] }];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = (item as Record<string, { security?: unknown } | undefined>)[method];
      if (!operation) {
        continue;
      }
      const auth = authByOperation.get(`${method.toUpperCase()} ${path}`);
      if (auth === "public") {
        operation.security = [];
      } else if (auth === "bearer") {
        operation.security = [{ bearerAuth: [] }];
      }
      // Otherwise the operation inherits the document-level cookieAuth default.
    }
  }
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
  cachedContractDoc ??= (async () => {
    const router = buildContractRouter();
    const doc = await generator.generate(router);
    applySecurity(doc, router);
    return doc;
  })();
  return cachedContractDoc;
}
