// oxlint-disable-next-line no-restricted-imports -- the document enumerates every contract, so the barrel is the point here; apps/api runs unbundled on Bun.
import * as contracts from "@openrift/shared/contracts";
import type { AnyContractRouter } from "@orpc/contract";
import type { OpenAPI } from "@orpc/openapi";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

// This is the only OpenAPI document the API produces. A few plain Hono
// endpoints (health, Sentry tunnel, share/list image generators, email
// unsubscribe) don't serve typed JSON and are excluded on purpose.

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

/**
 * Collects every `*Contract` export from the shared contracts barrel into one
 * router object; keys are arbitrary since the OpenAPI path comes from each
 * procedure's `.route({ path })`.
 */
function buildContractRouter(): AnyContractRouter {
  const router: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(contracts)) {
    if (key.endsWith("Contract")) {
      router[key] = value;
    }
  }
  return router as AnyContractRouter;
}

type AuthLevel = "public" | "bearer" | undefined;

interface ContractDef {
  route?: { method?: string; path?: string };
  meta?: { auth?: AuthLevel };
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

/** Records each operation's auth level (from `meta`), keyed by `"METHOD /path"`. */
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

// Admin operations aren't gated by contract meta; they're gated by the
// requireAdmin Hono middleware on the /api/admin/v1/* prefix (see app.ts).
// Stamp the admin security marker by path instead, mirroring that mount.
const ADMIN_PATH_PREFIX = "/api/admin/";

/**
 * Sets each operation's OpenAPI `security`: cookieAuth by default
 * (fail-closed), `[]` for public reads, `bearerAuth` for the provider push,
 * `adminAuth` for the admin path prefix.
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
      if (path.startsWith(ADMIN_PATH_PREFIX)) {
        operation.security = [{ adminAuth: [] }];
      } else if (auth === "public") {
        operation.security = [];
      } else if (auth === "bearer") {
        operation.security = [{ bearerAuth: [] }];
      }
      // Otherwise the operation inherits the document-level cookieAuth default.
    }
  }
}

// Static for a given build; reused across requests to /api/doc and /api/admin/doc.
let cachedContractDoc: Promise<OpenAPI.Document> | null = null;

export function generateContractOpenAPIDocument(): Promise<OpenAPI.Document> {
  cachedContractDoc ??= (async () => {
    const router = buildContractRouter();
    const doc = await generator.generate(router);
    applySecurity(doc, router);
    return doc;
  })();
  return cachedContractDoc;
}
